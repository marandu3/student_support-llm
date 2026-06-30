"""
FastAPI application: endpoints, CORS, RAG warm-up and exception handlers.
"""

import json
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from config import (
    API_KEY,
    API_KEY_HEADER,
    APP_NAME,
    APP_VERSION,
    AUTH_TOKEN_TTL,
    CORS_ORIGINS,
    MODEL_NAME,
    PUBLIC_PATHS,
    REQUIRE_AUTH,
    ROLE_ADMIN,
    MAX_RAG_FILE_SIZE,   # <-- ADD THIS
)
from auth import (
    authenticate,
    create_token,
    decode_token,
    get_user,
    register_user,
    seed_default_accounts,
    verify_token,
)
from exceptions import (
    AppError,
    EmptyQuestionError,
    FileTooLargeError,
    InvalidCredentialsError,
    LLMConnectionError,
    ModelNotFoundError,
    QuestionTooLongError,
    RAGError,
    UnsupportedFileTypeError,
    UserExistsError,
)
from llm_client import (
    get_current_model,
    get_ollama_models,
    list_models_detailed,
    model_available,
    pull_model,
    set_current_model,
    stream_llm,
)
from logger import logger
from model import (
    AnswerResponse,
    AuthResponse,
    DocumentContentResponse,
    FeedbackRequest,
    HealthResponse,
    HistoryResponse,
    LoginRequest,
    ModelSelectRequest,
    QuestionRequest,
    RagDocumentList,
    RegisterRequest,
    SessionDetailResponse,
    SessionListResponse,
    SuggestionsResponse,
    UploadResponse,
    UserPublic,
)
from history_store import (
    delete_session,
    get_session,
    list_sessions,
)
from services import (
    build_context_for_stream,
    get_suggestions,
    process_question,
    record_feedback,
    record_stream_result,
)
from utils import current_timestamp, new_session_id, validate_upload


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warm up storage + RAG index at startup; never block app start on failure."""
    try:
        seed_default_accounts()
    except Exception as exc:
        logger.error("Account seeding failed: %s", exc)
    try:
        from rag_engine import warm_up

        warm_up()
        logger.info("RAG engine warmed up.")
    except Exception as exc:
        logger.error("RAG warm-up failed (continuing without RAG): %s", exc)
    yield


app = FastAPI(title=APP_NAME, version=APP_VERSION, lifespan=lifespan)


# Optional auth. Defined before CORS is added so CORS ends up the OUTERMOST
# middleware and still attaches headers to 401 responses. A request is allowed
# when it carries the API key OR a valid bearer token (from /auth/login).
# Enforcement only kicks in when REQUIRE_AUTH is on or an API_KEY is configured.
@app.middleware("http")
async def auth_guard(request: Request, call_next):
    enforce = REQUIRE_AUTH or bool(API_KEY)
    if enforce:
        if request.method != "OPTIONS" and request.url.path not in PUBLIC_PATHS:
            if not _request_authorized(request):
                return _error(401, "Unauthorized", "Missing or invalid credentials")
    return await call_next(request)


def _bearer_token(request: Request) -> str | None:
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


def _request_authorized(request: Request) -> bool:
    if API_KEY and request.headers.get(API_KEY_HEADER) == API_KEY:
        return True
    token = _bearer_token(request)
    return bool(token and verify_token(token))


def _current_user(request: Request) -> dict | None:
    """Resolve the user from the bearer token, or None for anonymous/guest."""
    token = _bearer_token(request)
    payload = decode_token(token) if token else None
    if not payload:
        return None
    return {"username": payload.get("sub"), "role": payload.get("role", "student")}


def _username_of(request: Request) -> str:
    user = _current_user(request)
    return user["username"] if user else "guest"


def _is_admin(request: Request) -> bool:
    user = _current_user(request)
    return bool(user and user.get("role") == ROLE_ADMIN)


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------

def _error(status_code: int, error: str, detail: str | None = None) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": error, "detail": detail})


@app.exception_handler(EmptyQuestionError)
async def _empty_question(request: Request, exc: EmptyQuestionError):
    return _error(400, "Question cannot be empty")


@app.exception_handler(QuestionTooLongError)
async def _question_too_long(request: Request, exc: QuestionTooLongError):
    return _error(400, "Question exceeds maximum length")


@app.exception_handler(UnsupportedFileTypeError)
async def _unsupported_file(request: Request, exc: UnsupportedFileTypeError):
    return _error(400, "Unsupported file type (.txt, .md, .pdf, .docx)", str(exc))


@app.exception_handler(FileTooLargeError)
async def _file_too_large(request: Request, exc: FileTooLargeError):
    return _error(413, "File too large (max 5MB)", str(exc))


@app.exception_handler(RAGError)
async def _rag_error(request: Request, exc: RAGError):
    return _error(400, "Could not process document", str(exc))


@app.exception_handler(ModelNotFoundError)
async def _model_not_found(request: Request, exc: ModelNotFoundError):
    return _error(400, f"Model not available. Please install {MODEL_NAME}", str(exc))


@app.exception_handler(LLMConnectionError)
async def _llm_unavailable(request: Request, exc: LLMConnectionError):
    return _error(503, "LLM service unavailable", str(exc))


@app.exception_handler(UserExistsError)
async def _user_exists(request: Request, exc: UserExistsError):
    return _error(409, "Username already taken", str(exc))


@app.exception_handler(InvalidCredentialsError)
async def _invalid_credentials(request: Request, exc: InvalidCredentialsError):
    return _error(401, "Invalid username or password")


@app.exception_handler(AppError)
async def _app_error(request: Request, exc: AppError):
    logger.error("Unhandled application error: %s", exc)
    return _error(500, "Internal application error", str(exc))


@app.exception_handler(Exception)
async def _unexpected(request: Request, exc: Exception):
    logger.exception("Unexpected server error")
    return _error(500, "Unexpected server error", str(exc))


# ---------------------------------------------------------------------------
# Basic endpoints
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    """Welcome message."""
    return {
        "application": APP_NAME,
        "version": APP_VERSION,
        "message": "Welcome to the UDSM Student Support Assistant API.",
        "docs": "/docs",
    }


@app.get("/health", response_model=HealthResponse)
def health():
    """Health check: backend, Ollama, model and RAG status."""
    from rag_engine import is_ready

    start = time.time()
    active_model = get_current_model()
    try:
        get_ollama_models()
        ollama_status = "running"
        model_status = "available" if model_available(active_model) else "missing"
    except LLMConnectionError:
        ollama_status = "offline"
        model_status = "unknown"

    return HealthResponse(
        status="ok",
        backend="running",
        ollama=ollama_status,
        model=f"{active_model} ({model_status})",
        rag_ready=is_ready(),
        timestamp=current_timestamp(),
        response_time=round(time.time() - start, 3),
    )


# ---------------------------------------------------------------------------
# Model management
# ---------------------------------------------------------------------------

@app.get("/model")
def model():
    """Report the active model and any installed Ollama models."""
    try:
        installed = get_ollama_models()
    except LLMConnectionError:
        installed = []
    return {"model": get_current_model(), "provider": "Ollama", "installed": installed}


@app.get("/models")
def models_list():
    """List installed Ollama models (with metadata) and the active model."""
    try:
        available = list_models_detailed()
    except LLMConnectionError:
        available = []
    return {"current": get_current_model(), "available": available}


@app.post("/model/select")
def model_select(request: ModelSelectRequest):
    """Switch the active model to an already-installed one."""
    name = request.model.strip()
    if not model_available(name):
        return _error(400, "Model not installed", f"'{name}' is not available in Ollama. Pull it first.")
    return {"current": set_current_model(name), "message": f"Active model is now {name}."}


@app.post("/model/pull")
async def model_pull(request: ModelSelectRequest):
    """Download a model from the Ollama registry, streaming progress as SSE."""
    name = request.model.strip()

    async def event_generator():
        try:
            async for progress in pull_model(name):
                yield f"data: {json.dumps(progress)}\n\n"
            yield f"data: {json.dumps({'status': 'success', 'done': True})}\n\n"
        except (LLMConnectionError, ModelNotFoundError) as exc:
            yield f"data: {json.dumps({'status': 'error', 'detail': str(exc)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

def _auth_response(user: dict) -> AuthResponse:
    token = create_token(user["username"], time.time(), role=user.get("role", "student"))
    return AuthResponse(token=token, expires_in=AUTH_TOKEN_TTL, user=UserPublic(**user))


@app.post("/auth/register", response_model=AuthResponse)
def auth_register(request: RegisterRequest):
    """Create an account and return a signed token (auto-login on signup)."""
    user = register_user(
        request.username,
        request.password,
        display_name=request.display_name or "",
        email=request.email or "",
    )
    return _auth_response(user)


@app.post("/auth/login", response_model=AuthResponse)
def auth_login(request: LoginRequest):
    """Verify credentials and return a signed bearer token."""
    user = authenticate(request.username, request.password)
    return _auth_response(user)


@app.get("/auth/me", response_model=UserPublic)
def auth_me(request: Request):
    """Return the current user for a valid bearer token, else 401."""
    username = _username_of(request)
    if username == "guest":
        return _error(401, "Unauthorized", "Missing or invalid token")
    user = get_user(username)
    if not user:
        return _error(401, "Unauthorized", "User no longer exists")
    return UserPublic(**user)


# ---------------------------------------------------------------------------
# Question answering
# ---------------------------------------------------------------------------

@app.post("/ask", response_model=AnswerResponse)
def ask(request: QuestionRequest, http_request: Request):
    """Non-streaming question answering (FAQ fast-path, else RAG + LLM)."""
    return process_question(
        request.question,
        session_id=request.session_id,
        file_content=request.file_content,
        username=_username_of(http_request),
    )


@app.post("/ask/stream")
async def ask_stream(request: QuestionRequest, http_request: Request):
    """Streaming question answering via Server-Sent Events."""
    username = _username_of(http_request)
    session_id, context_text, contexts = build_context_for_stream(
        request.question,
        session_id=request.session_id,
        file_content=request.file_content,
        username=username,
    )

    async def event_generator():
        yield f"data: {json.dumps({'type': 'session', 'session_id': session_id})}\n\n"
        start = time.time()
        pieces: list[str] = []
        metrics: dict = {}
        try:
            async for token in stream_llm(request.question, context_text, metrics=metrics):
                pieces.append(token)
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
        except (LLMConnectionError, ModelNotFoundError) as exc:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(exc)})}\n\n"
            return
        answer = "".join(pieces)
        elapsed = round(time.time() - start, 2)

        eval_count = metrics.get("eval_count")
        eval_duration = metrics.get("eval_duration")  # nanoseconds
        if eval_count and eval_duration:
            tokens_per_second = round(eval_count / (eval_duration / 1e9), 1)
        elif elapsed > 0:
            eval_count = len(pieces)
            tokens_per_second = round(len(pieces) / elapsed, 1)
        else:
            tokens_per_second = None

        active_model = get_current_model()
        record_stream_result(
            session_id, request.question, answer, elapsed, contexts,
            username=username, tokens_per_second=tokens_per_second, model=active_model,
        )

        done = {
            "type": "done",
            "session_id": session_id,
            "response_time": elapsed,
            "retrieved_context": contexts,
            "tokens_per_second": tokens_per_second,
            "eval_count": eval_count,
            "model": active_model,
        }
        yield f"data: {json.dumps(done)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Suggestions
# ---------------------------------------------------------------------------

@app.get("/suggestions", response_model=SuggestionsResponse)
def suggestions(count: int = 4):
    """Return dynamic suggested questions (grounded in the KB when present)."""
    return SuggestionsResponse(suggestions=get_suggestions(count=max(1, min(count, 8))))


# ---------------------------------------------------------------------------
# Inline file upload (per-session temporary context)
# ---------------------------------------------------------------------------

@app.post("/upload", response_model=UploadResponse)
async def upload(
    file: UploadFile = File(...),
    session_id: str | None = Form(default=None),
):
    """Accept a file, extract its text and index it as temporary session context."""
    from extractors import extract_text
    from rag_engine import process_uploaded_file

    raw = await file.read()
    validate_upload(file.filename, raw)  # raises on bad type / size

    session_id = session_id or new_session_id()
    text = extract_text(file.filename, raw)
    chunks = process_uploaded_file(text, session_id)
    del raw

    return UploadResponse(
        session_id=session_id,
        filename=file.filename,
        chunks_indexed=chunks,
        message="File processed. Ask questions referencing this document.",
    )


# ---------------------------------------------------------------------------
# RAG knowledge-base management (admin)
# ---------------------------------------------------------------------------

@app.get("/rag/documents", response_model=RagDocumentList)
def rag_documents():
    """List the documents in the knowledge base."""
    from rag_engine import is_ready
    from rag_store import list_documents

    return RagDocumentList(documents=list_documents(), rag_ready=is_ready())


@app.post("/rag/documents", response_model=RagDocumentList)
async def rag_upload(request: Request, file: UploadFile = File(...)):
    """Admin-only: add a document to the knowledge base and rebuild the index."""
    if not _is_admin(request):
        return _error(403, "Forbidden", "Administrator role required.")
    from rag_engine import rebuild_index
    from rag_store import add_document, list_documents

    raw = await file.read()
    validate_upload(file.filename, raw, max_size=MAX_RAG_FILE_SIZE)
    add_document(file.filename, raw, uploaded_by=_username_of(request))
    rebuild_index()
    del raw
    from rag_engine import is_ready

    return RagDocumentList(documents=list_documents(), rag_ready=is_ready())


@app.delete("/rag/documents/{doc_id}", response_model=RagDocumentList)
def rag_delete(doc_id: str, request: Request):
    """Admin-only: remove a knowledge-base document and rebuild the index."""
    if not _is_admin(request):
        return _error(403, "Forbidden", "Administrator role required.")
    from rag_engine import is_ready, rebuild_index
    from rag_store import delete_document, list_documents

    if not delete_document(doc_id):
        return _error(404, "Not found", "No such document.")
    rebuild_index()
    return RagDocumentList(documents=list_documents(), rag_ready=is_ready())


@app.get("/rag/documents/{doc_id}", response_model=DocumentContentResponse)
def rag_document_text(doc_id: str):
    """Return a document's full text for the source-reference viewer."""
    from rag_store import get_document_meta, get_document_text

    text = get_document_text(doc_id)
    meta = get_document_meta(doc_id)
    if text is None or meta is None:
        return _error(404, "Not found", "No such document.")
    return DocumentContentResponse(doc_id=doc_id, filename=meta["filename"], text=text)


# ---------------------------------------------------------------------------
# Feedback
# ---------------------------------------------------------------------------

@app.post("/feedback")
def feedback(request: FeedbackRequest, http_request: Request):
    """Log a user feedback rating (good / average / poor)."""
    allowed = {"good", "average", "poor"}
    rating = request.rating.strip().lower()
    if rating not in allowed:
        return _error(400, "Rating must be one of: good, average, poor")
    record_feedback(
        request.session_id, rating, request.comment, username=_username_of(http_request)
    )
    return {"message": "Feedback recorded. Thank you!", "rating": rating}


# ---------------------------------------------------------------------------
# Chat sessions / history
# ---------------------------------------------------------------------------

@app.get("/sessions", response_model=SessionListResponse)
def sessions_list(request: Request):
    """List the current user's chat sessions for the history sidebar."""
    return SessionListResponse(sessions=list_sessions(_username_of(request)))


@app.get("/sessions/{session_id}", response_model=SessionDetailResponse)
def session_detail(session_id: str, request: Request):
    """Return one conversation with its messages so the UI can reload it."""
    session = get_session(session_id, _username_of(request))
    if not session:
        return _error(404, "Not found", "No such session.")
    return SessionDetailResponse(
        session_id=session["session_id"],
        title=session.get("title", "Chat"),
        messages=session.get("messages", []),
    )


@app.delete("/sessions/{session_id}")
def session_delete(session_id: str, request: Request):
    """Delete one of the current user's chat sessions."""
    if not delete_session(session_id, _username_of(request)):
        return _error(404, "Not found", "No such session.")
    return {"message": "Session deleted."}


# ---------------------------------------------------------------------------
# Legacy in-memory history (kept for backwards compatibility)
# ---------------------------------------------------------------------------

@app.get("/history", response_model=HistoryResponse)
def history(session_id: str | None = None, request: Request = None):
    """Return conversation history for a session (from the session store)."""
    username = _username_of(request) if request else "guest"
    items = []
    if session_id:
        session = get_session(session_id, username)
        if session:
            msgs = session.get("messages", [])
            # Pair user/assistant messages into Q&A records.
            pending_q = None
            for m in msgs:
                if m["role"] == "user":
                    pending_q = m["content"]
                elif m["role"] == "assistant" and pending_q is not None:
                    items.append(
                        {
                            "question": pending_q,
                            "answer": m["content"],
                            "source": m.get("source") or "LLM",
                            "response_time": m.get("response_time") or 0.0,
                            "timestamp": m.get("created_at", ""),
                        }
                    )
                    pending_q = None
    return HistoryResponse(session_id=session_id, history=items)
