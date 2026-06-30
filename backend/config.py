"""
Application configuration.

All configurable values live here so they can be changed without touching
application code. Values may be overridden through environment variables
(optionally loaded from a local .env file).
"""

import os

from dotenv import load_dotenv

# Load variables from a .env file in the backend directory if present.
load_dotenv()


def _get_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _get_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


# ==========================
# Paths
# ==========================

# Absolute path to the backend/ directory so the app runs from any CWD.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATA_DIR = os.path.join(BASE_DIR, "data")

# Admin-managed knowledge base: extracted plain-text of every RAG document,
# stored as "{doc_id}.txt" so offsets line up with what was embedded.
KB_DIR = os.path.join(DATA_DIR, "kb")

# Metadata for the knowledge-base documents (file fallback when Mongo is off).
RAG_DOCS_FILE = os.path.join(DATA_DIR, "rag_documents.json")

LOG_DIRECTORY = os.path.join(BASE_DIR, "logs")

# Where the FAISS index + chunk metadata are cached between runs.
CACHE_DIR = os.path.join(BASE_DIR, "data", ".cache")


# ==========================
# Application
# ==========================

APP_NAME = "UDSM Student Support Assistant"

APP_VERSION = "2.0.0"

DEBUG = _get_bool("DEBUG", True)

HOST = os.getenv("HOST", "127.0.0.1")

PORT = _get_int("PORT", 8000)

# Origins allowed by CORS. "*" allows any origin (fine for local development);
# in production set CORS_ORIGINS to an explicit comma-separated allowlist.
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]


# ==========================
# Authentication (optional)
# ==========================

# Optional API key. When set (non-empty), protected endpoints require the key
# in the API_KEY_HEADER header. Empty (the default) disables auth entirely so
# the local demo works out of the box.
API_KEY = os.getenv("API_KEY", "").strip()

# Header clients must send the key in.
API_KEY_HEADER = os.getenv("API_KEY_HEADER", "X-API-Key")

# When true, protected endpoints require either a valid bearer token (from
# /auth/login) or the API key. Registration and login always work regardless.
# Default false so the local demo works without anyone signing in.
REQUIRE_AUTH = _get_bool("REQUIRE_AUTH", False)

# Secret used to sign auth tokens. Override in production via the environment.
AUTH_SECRET = os.getenv("AUTH_SECRET", "udsm-dev-secret-change-me")

# Token lifetime in seconds (default 7 days).
AUTH_TOKEN_TTL = _get_int("AUTH_TOKEN_TTL", 7 * 24 * 60 * 60)

# Where registered user accounts are stored (file fallback when Mongo is off).
USERS_FILE = os.path.join(DATA_DIR, "users.json")

# Seeded accounts created on first run so the app is usable immediately.
# The demo account lets anyone try the tool; the admin account can manage RAG.
DEFAULT_ADMIN_USERNAME = os.getenv("DEFAULT_ADMIN_USERNAME", "admin").strip().lower()
DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin12345")
DEMO_USERNAME = os.getenv("DEMO_USERNAME", "demo").strip().lower()
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "demo12345")

# Recognised roles. "admin" can manage RAG documents; "student" is the default.
ROLE_ADMIN = "admin"
ROLE_STUDENT = "student"
ROLES = {ROLE_ADMIN, ROLE_STUDENT}

# Paths that never require a key/token (welcome, health, docs, auth itself).
PUBLIC_PATHS = {
    "/",
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/favicon.ico",
    "/auth/register",
    "/auth/login",
    "/suggestions",
}


# ==========================
# Database (MongoDB, optional)
# ==========================

# When MONGO_URL is set and reachable, users / chat history / feedback / RAG
# document metadata are persisted in MongoDB. When it is empty or unreachable,
# the app transparently falls back to JSON files + in-memory stores so local
# development works without a database. docker-compose sets MONGO_URL.
MONGO_URL = os.getenv("MONGO_URL", "").strip()

MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "udsm_assistant")

# How long (ms) to wait when first connecting before falling back.
MONGO_TIMEOUT_MS = _get_int("MONGO_TIMEOUT_MS", 2000)


# ==========================
# Ollama
# ==========================

OLLAMA_HOST = os.getenv("OLLAMA_URL", "http://localhost:11434")

MODEL_NAME = os.getenv("MODEL_NAME", "phi3")

REQUEST_TIMEOUT = _get_int("REQUEST_TIMEOUT", 120)


# ==========================
# Logging
# ==========================

LOG_FILE = os.path.join(LOG_DIRECTORY, "app.log")

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Rotating file handler settings.
LOG_MAX_BYTES = _get_int("LOG_MAX_BYTES", 5 * 1024 * 1024)  # 5 MB

LOG_BACKUP_COUNT = _get_int("LOG_BACKUP_COUNT", 5)


# ==========================
# Validation / Uploads
# ==========================

MAX_QUESTION_LENGTH = _get_int("MAX_QUESTION_LENGTH", 1000)

# Maximum upload size in bytes (default 5 MB) for per-question attachments.
MAX_FILE_SIZE = _get_int("MAX_FILE_SIZE", 5 * 1024 * 1024)

# Maximum upload size in bytes for admin RAG knowledge-base documents.
# These are typically larger (full PDFs/handbooks), so allow more (default 50 MB).
MAX_RAG_FILE_SIZE = _get_int("MAX_RAG_FILE_SIZE", 50 * 1024 * 1024)

# Allowed upload extensions (lower case, with dot).
ALLOWED_FILE_EXTENSIONS = {".txt", ".md", ".pdf", ".docx"}


# ==========================
# RAG / Vector store
# ==========================

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

# "auto" -> use GPU when available, else CPU. May be forced to "cuda" / "cpu".
EMBEDDING_DEVICE = os.getenv("EMBEDDING_DEVICE", "auto")

CHUNK_SIZE = _get_int("CHUNK_SIZE", 500)

CHUNK_OVERLAP = _get_int("CHUNK_OVERLAP", 100)

# Number of chunks returned by a retrieval call.
TOP_K = _get_int("TOP_K", 3)

# Minimum cosine similarity for a retrieved chunk to be considered relevant.
MIN_RELEVANCE_SCORE = float(os.getenv("MIN_RELEVANCE_SCORE", "0.15"))


# ==========================
# FAQ
# ==========================

FAQ_FILE = os.path.join(DATA_DIR, "faq.json")
