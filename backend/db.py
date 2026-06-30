"""
MongoDB connection layer with a graceful fallback.

When ``MONGO_URL`` is configured and reachable, this module exposes the live
collections used for users, chat sessions/messages, feedback and RAG document
metadata. When Mongo is absent or unreachable, ``mongo_enabled()`` returns
False and callers transparently use their JSON-file / in-memory fallbacks, so
the app still runs locally without a database (docker-compose provides Mongo).

The connection is attempted lazily on first use and the result cached, so a
missing database never blocks startup.
"""

import threading
from typing import Optional

from config import MONGO_DB_NAME, MONGO_TIMEOUT_MS, MONGO_URL
from logger import logger

_client = None
_db = None
_state: Optional[bool] = None  # None = not yet probed, True/False = result
_lock = threading.Lock()


def _connect() -> bool:
    """Attempt a connection once; cache the outcome. Returns True on success."""
    global _client, _db, _state
    if not MONGO_URL:
        logger.info("MONGO_URL not set; using file/in-memory storage.")
        _state = False
        return False
    try:
        from pymongo import MongoClient

        _client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=MONGO_TIMEOUT_MS)
        # Force a round-trip so we fail fast when Mongo is down.
        _client.admin.command("ping")
        _db = _client[MONGO_DB_NAME]
        _ensure_indexes(_db)
        logger.info("Connected to MongoDB at %s (db=%s).", MONGO_URL, MONGO_DB_NAME)
        _state = True
        return True
    except Exception as exc:  # ImportError, ServerSelectionTimeoutError, ...
        logger.warning(
            "MongoDB unavailable (%s); falling back to file/in-memory storage.", exc
        )
        _client = None
        _db = None
        _state = False
        return False


def _ensure_indexes(db) -> None:
    """Create the few indexes we rely on (idempotent)."""
    try:
        db.users.create_index("username", unique=True)
        db.sessions.create_index([("username", 1), ("updated_at", -1)])
        db.messages.create_index([("session_id", 1), ("created_at", 1)])
        db.rag_documents.create_index("doc_id", unique=True)
    except Exception as exc:
        logger.warning("Could not create Mongo indexes: %s", exc)


def mongo_enabled() -> bool:
    """True when a live MongoDB connection is available."""
    global _state
    if _state is None:
        with _lock:
            if _state is None:
                _connect()
    return bool(_state)


def get_db():
    """Return the live Mongo database, or None when running in fallback mode."""
    return _db if mongo_enabled() else None


def collection(name: str):
    """Return a Mongo collection by name, or None in fallback mode."""
    db = get_db()
    return db[name] if db is not None else None
