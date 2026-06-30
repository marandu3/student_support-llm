# UDSM Student Support Assistant — Backend

A self-hosted FastAPI backend that answers University of Dar es Salaam (UDSM)
student questions using a local LLM (Ollama + `phi3`) augmented with
Retrieval-Augmented Generation (RAG) over UDSM documents.

## Features

- **RAG** over bundled UDSM documents (the real 2022/2023 Undergraduate
  Prospectus PDF, plus almanac and examination rules) using
  `sentence-transformers` (`all-MiniLM-L6-v2`) + **FAISS** cosine search.
  Documents may be `.txt`, `.md` or `.pdf` (PDFs parsed with `pypdf`).
  Embeddings run on the **GPU when available, CPU otherwise** (auto-detected).
- **FAQ fast-path** for common questions before hitting the LLM.
- **Streaming** answers over Server-Sent Events (`/ask/stream`).
- **File upload** (`.txt` / `.md`) for asking questions about your own document.
- **Feedback** endpoint, **session** tracking and **history**.
- Structured, **rotating** logging of every interaction.
- Comprehensive error handling with custom FastAPI exception handlers.
- **Optional API-key auth** (disabled by default) + configurable CORS allowlist.

## Architecture

| File | Responsibility |
|------|----------------|
| `main.py` | FastAPI app, endpoints, CORS, exception handlers, RAG warm-up |
| `config.py` | Configuration (env-overridable via `.env`) |
| `model.py` | Pydantic request/response models |
| `prompts.py` | Original (bad) vs improved (good) prompts |
| `llm_client.py` | Ollama calls: sync, async streaming, model checks |
| `rag_engine.py` | Loading, chunking, embeddings, FAISS index, retrieval |
| `services.py` | Orchestration: validate → FAQ/RAG → LLM → log |
| `logger.py` | Rotating file + console logging, structured interaction log |
| `utils.py` | Timestamps, session ids, FAQ lookup, upload validation |
| `exceptions.py` | Custom domain exceptions |
| `data/` | UDSM documents (`.txt`/`.md`/`.pdf`) + `faq.json` (+ cached FAISS index) |
| `tests/test_api.py` | API test suite |

## Requirements

- **Python 3.12** (PyTorch and `faiss-cpu` have no 3.14 wheels yet).
- **Ollama** running locally with the `phi3` model: `ollama pull phi3`.
- Optional: an NVIDIA GPU + CUDA for faster embeddings (falls back to CPU).

## Setup

```bash
# From the backend/ directory.

# 1. Create and activate a Python 3.12 virtual environment.
python3.12 -m venv venv312
# Windows PowerShell:
venv312\Scripts\Activate.ps1
# Git Bash / Linux / macOS:
source venv312/Scripts/activate   # or venv312/bin/activate

# 2. Install PyTorch (pick ONE).
#    GPU (CUDA 12.4):
pip install torch --index-url https://download.pytorch.org/whl/cu124
#    CPU only:
# pip install torch --index-url https://download.pytorch.org/whl/cpu

# 3. Install the rest.
pip install -r requirements.txt

# 4. (Optional) configure environment.
cp .env.example .env
```

## Running

```bash
# Ensure Ollama is running and phi3 is installed:
ollama pull phi3

# Start the API (from backend/).
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Open the interactive docs at <http://127.0.0.1:8000/docs>.

The first start builds the FAISS index and caches it under `data/.cache/`;
subsequent starts load it from cache.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Welcome message |
| GET | `/health` | Backend, Ollama, model and RAG status |
| GET | `/model` | Configured model + installed Ollama models |
| POST | `/auth/register` | Create an account, returns a signed bearer token |
| POST | `/auth/login` | Log in, returns a signed bearer token |
| GET | `/auth/me` | Current user for a valid bearer token |
| POST | `/ask` | Non-streaming question answering |
| POST | `/ask/stream` | Streaming answer (Server-Sent Events) |
| POST | `/upload` | Upload a `.txt`/`.md` file as temporary context |
| POST | `/feedback` | Submit a rating (`good`/`average`/`poor`) |
| GET | `/history` | Conversation history (optional `?session_id=`) |
| DELETE | `/history` | Clear history (optional `?session_id=`) |

### Examples

```bash
# Ask a question
curl -X POST http://127.0.0.1:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "When does Semester I begin?"}'

# Stream an answer
curl -N -X POST http://127.0.0.1:8000/ask/stream \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the exam rules?"}'

# Upload a document, then ask about it (reuse the returned session_id)
curl -X POST http://127.0.0.1:8000/upload -F "file=@mynotes.txt"

# Feedback
curl -X POST http://127.0.0.1:8000/feedback \
  -H "Content-Type: application/json" \
  -d '{"session_id": "abc123", "rating": "good"}'
```

## Authentication

The backend supports **user accounts** (register / login) and an optional
**API key**. Both are designed so the local demo works with zero setup.

### User accounts (register / login)

`/auth/register` and `/auth/login` always work and return a signed **bearer
token**. Passwords are hashed with PBKDF2-HMAC-SHA256 + a per-user salt and
stored in `data/users.json`; tokens are stateless and HMAC-signed (no extra
dependencies). The web frontend uses this flow to gate the app.

```bash
# Register (auto-login: returns a token)
curl -X POST http://127.0.0.1:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "secret123", "display_name": "Alice"}'

# Log in
curl -X POST http://127.0.0.1:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "secret123"}'

# Use the token
curl -H "Authorization: Bearer <token>" http://127.0.0.1:8000/auth/me
```

### Enforcing auth on protected endpoints

By default the question/upload/feedback endpoints are **open** so the demo runs
without signing in. Turn enforcement on with `REQUIRE_AUTH=true` and/or an
`API_KEY`. When enforced, every endpoint **except** `/`, `/health`, the docs and
`/auth/register` + `/auth/login` requires **either** a valid bearer token **or**
the API key:

```bash
# .env
REQUIRE_AUTH=true
AUTH_SECRET=change-me-in-production
# Optional shared key (alternative to a user token)
API_KEY=udsm-secret-123
API_KEY_HEADER=X-API-Key   # optional, this is the default
```

```bash
# Rejected (401)
curl http://127.0.0.1:8000/model
# Accepted (bearer token)
curl -H "Authorization: Bearer <token>" http://127.0.0.1:8000/model
# Accepted (API key)
curl -H "X-API-Key: udsm-secret-123" http://127.0.0.1:8000/model
```

CORS preflight (`OPTIONS`) requests are never blocked. For production, also set
`CORS_ORIGINS` to an explicit allowlist instead of `*`.

## Configuration

All settings live in `config.py` and can be overridden via environment
variables / `.env` (see `.env.example`). Key options: `MODEL_NAME`,
`OLLAMA_URL`, `LOG_LEVEL`, `MAX_FILE_SIZE`, `EMBEDDING_DEVICE` (`auto`/`cuda`/`cpu`),
`CHUNK_SIZE`, `CHUNK_OVERLAP`, `TOP_K`, `REQUIRE_AUTH`, `AUTH_SECRET`,
`AUTH_TOKEN_TTL`, `API_KEY`, `CORS_ORIGINS`.

## Testing

With the server running in one terminal:

```bash
# Standalone (prints PASS/FAIL, writes tests/test_results.txt)
python tests/test_api.py

# Or with pytest
pytest tests/test_api.py
```

If the server is running with `API_KEY` set, export the same key before running
the tests so authenticated requests succeed: `export API_KEY=udsm-secret-123`.
The suite (16 tests) covers every endpoint, the 400/413 error paths,
register/login and auth enforcement.

## Troubleshooting

- **`LLM service unavailable` (503):** Ollama isn't running. Start it and
  confirm `ollama list` shows `phi3`.
- **`Model not available` (400):** run `ollama pull phi3`.
- **`pip install torch` fails:** you're likely on Python 3.13/3.14. Use a
  Python 3.12 venv.
- **Embeddings slow / want GPU:** set `EMBEDDING_DEVICE=cuda` and ensure you
  installed the CUDA build of PyTorch. The app auto-detects the GPU by default.
- **Stale RAG answers after editing `data/`:** delete `data/.cache/` to force a
  rebuild (it also rebuilds automatically when document files change).
