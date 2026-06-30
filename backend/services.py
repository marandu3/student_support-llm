"""
Business logic: orchestrates validation, FAQ lookup, RAG retrieval, the LLM
call, per-user session history, feedback and dynamic suggestions.
"""

import random
import time
from typing import List, Optional, Tuple

from config import MAX_QUESTION_LENGTH
from exceptions import EmptyQuestionError, QuestionTooLongError
from history_store import add_message
from history_store import record_feedback as _store_feedback
from llm_client import ask_llm, model_available
from logger import log_interaction, logger
from rag_engine import process_uploaded_file, retrieve_context_detailed
from utils import current_timestamp, new_session_id, search_faq

# Fallback suggestions used before any documents are uploaded.
_BASE_SUGGESTIONS = [
    "How do I register for courses this semester?",
    "What are the examination rules at UDSM?",
    "How do I apply for university accommodation?",
    "When is the deadline for fee payment?",
    "How can I get my academic transcript?",
    "What library services are available to students?",
    "How do I reset my student portal password?",
    "What is the procedure for changing my programme?",
]


def _validate(question: str) -> str:
    question = question.strip()
    if question == "":
        raise EmptyQuestionError()
    if len(question) > MAX_QUESTION_LENGTH:
        raise QuestionTooLongError()
    return question


def _safe_retrieve(question: str, session_id: str) -> List[dict]:
    """Retrieve RAG context, degrading gracefully on any retrieval error."""
    try:
        return retrieve_context_detailed(question, session_id=session_id)
    except Exception as exc:  # requirement: log and proceed without context
        logger.error("RAG retrieval failed; continuing without context: %s", exc)
        return []


def process_question(
    question: str,
    session_id: Optional[str] = None,
    file_content: Optional[str] = None,
    username: str = "guest",
) -> dict:
    """Answer a question: FAQ fast-path, else RAG + LLM. Returns a full record."""
    question = _validate(question)
    session_id = session_id or new_session_id()

    if file_content:
        process_uploaded_file(file_content, session_id)

    add_message(session_id, "user", question, username=username)
    logger.info("Session %s question: %s", session_id, question)
    start = time.time()

    # Fast path: curated FAQ answers.
    faq_answer = search_faq(question)
    if faq_answer is not None:
        elapsed = round(time.time() - start, 2)
        add_message(
            session_id, "assistant", faq_answer, username=username,
            source="FAQ", response_time=elapsed,
        )
        log_interaction(session_id, question, faq_answer, "FAQ", elapsed)
        return {
            "question": question, "answer": faq_answer, "source": "FAQ",
            "response_time": elapsed, "timestamp": current_timestamp(),
            "session_id": session_id, "retrieved_context": None,
        }

    # RAG + LLM path.
    contexts = _safe_retrieve(question, session_id)
    context_text = "\n\n".join(c["text"] for c in contexts) if contexts else None
    answer = ask_llm(question, context_text)
    elapsed = round(time.time() - start, 2)

    add_message(
        session_id, "assistant", answer, username=username,
        source="LLM", response_time=elapsed, contexts=contexts or None,
    )
    log_interaction(session_id, question, answer, "LLM", elapsed, contexts)
    return {
        "question": question, "answer": answer, "source": "LLM",
        "response_time": elapsed, "timestamp": current_timestamp(),
        "session_id": session_id, "retrieved_context": contexts or None,
    }


def build_context_for_stream(
    question: str,
    session_id: Optional[str] = None,
    file_content: Optional[str] = None,
    username: str = "guest",
) -> Tuple[str, Optional[str], List[dict]]:
    """Prepare (session_id, context_text, contexts) for the streaming endpoint."""
    question = _validate(question)
    session_id = session_id or new_session_id()
    if file_content:
        process_uploaded_file(file_content, session_id)
    add_message(session_id, "user", question, username=username)
    contexts = _safe_retrieve(question, session_id)
    context_text = "\n\n".join(c["text"] for c in contexts) if contexts else None
    return session_id, context_text, contexts


def record_stream_result(
    session_id: str,
    question: str,
    answer: str,
    response_time: float,
    contexts: Optional[List[dict]],
    username: str = "guest",
    tokens_per_second: Optional[float] = None,
    model: Optional[str] = None,
) -> None:
    """Persist + log a completed streamed answer."""
    add_message(
        session_id, "assistant", answer, username=username, source="LLM",
        response_time=response_time, tokens_per_second=tokens_per_second,
        model=model, contexts=contexts or None,
    )
    log_interaction(session_id, question, answer, "LLM", response_time, contexts)


def record_feedback(
    session_id: str, rating: str, comment: Optional[str] = None, username: str = "guest"
) -> dict:
    """Store and log a user feedback rating."""
    return _store_feedback(session_id, rating, comment, username=username)


# ---------------------------------------------------------------------------
# Dynamic suggestions
# ---------------------------------------------------------------------------

_suggestion_cache: dict = {}  # signature -> list[str]


def get_suggestions(count: int = 4) -> List[str]:
    """Return dynamic suggested questions.

    When knowledge-base documents exist and the model is available, ask the LLM
    to propose grounded questions; otherwise rotate through a curated base set.
    Results are cached per corpus signature to keep the UI snappy.
    """
    from rag_engine import _corpus_signature, load_documents

    signature = _corpus_signature()
    if signature in _suggestion_cache:
        pool = _suggestion_cache[signature]
        return random.sample(pool, min(count, len(pool)))

    pool = list(_BASE_SUGGESTIONS)
    try:
        documents = load_documents()
        if documents and model_available():
            sample = "\n\n".join(d["text"][:600] for d in documents[:3])
            prompt = (
                "Based ONLY on the following university documents, write 6 short, "
                "natural questions a student might ask. One per line, no numbering, "
                "no preamble.\n\n" + sample
            )
            raw = ask_llm(prompt)
            generated = [
                line.strip(" -*0123456789.").strip()
                for line in raw.splitlines()
                if line.strip()
            ]
            generated = [q for q in generated if q.endswith("?") and len(q) > 12]
            if generated:
                pool = generated
    except Exception as exc:
        logger.warning("Suggestion generation failed; using base set: %s", exc)

    _suggestion_cache[signature] = pool
    return random.sample(pool, min(count, len(pool)))
