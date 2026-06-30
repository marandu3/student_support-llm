"""
Chat session + message persistence.

Stores conversations per user so the history sidebar can list them and reload
any past chat. Backed by MongoDB (``sessions`` + ``messages`` collections) when
available, with an in-memory fallback so the app still runs without a database.

A "session" is one conversation thread (one entry in the history sidebar). Its
title is derived from the first user message.
"""

import threading
from typing import List, Optional

from db import collection, mongo_enabled
from logger import logger
from utils import current_timestamp

_lock = threading.Lock()

# In-memory fallback stores.
_sessions: dict = {}   # session_id -> session dict
_messages: dict = {}   # session_id -> list[message dict]


def _title_from(text: str) -> str:
    text = " ".join((text or "").split())
    return (text[:48] + "…") if len(text) > 48 else (text or "New chat")


def ensure_session(session_id: str, username: str = "", title: str = "") -> None:
    """Create the session on first use; never overwrite an existing title."""
    now = current_timestamp()
    if mongo_enabled():
        sessions = collection("sessions")
        existing = sessions.find_one({"session_id": session_id})
        if existing is None:
            sessions.insert_one(
                {
                    "session_id": session_id,
                    "username": username or "guest",
                    "title": _title_from(title),
                    "created_at": now,
                    "updated_at": now,
                }
            )
        return
    with _lock:
        if session_id not in _sessions:
            _sessions[session_id] = {
                "session_id": session_id,
                "username": username or "guest",
                "title": _title_from(title),
                "created_at": now,
                "updated_at": now,
            }
            _messages.setdefault(session_id, [])


def add_message(
    session_id: str,
    role: str,
    content: str,
    username: str = "",
    source: Optional[str] = None,
    response_time: Optional[float] = None,
    tokens_per_second: Optional[float] = None,
    model: Optional[str] = None,
    contexts: Optional[List[dict]] = None,
) -> None:
    """Append a message to a session, creating the session if needed."""
    title = content if role == "user" else ""
    ensure_session(session_id, username=username, title=title)
    now = current_timestamp()
    record = {
        "session_id": session_id,
        "role": role,
        "content": content,
        "source": source,
        "response_time": response_time,
        "tokens_per_second": tokens_per_second,
        "model": model,
        "contexts": contexts or None,
        "created_at": now,
    }
    if mongo_enabled():
        collection("messages").insert_one(dict(record))
        collection("sessions").update_one(
            {"session_id": session_id}, {"$set": {"updated_at": now}}
        )
        return
    with _lock:
        _messages.setdefault(session_id, []).append(record)
        if session_id in _sessions:
            _sessions[session_id]["updated_at"] = now


def list_sessions(username: str) -> List[dict]:
    """Return session summaries for a user, most recently updated first."""
    if mongo_enabled():
        cursor = collection("sessions").find(
            {"username": username}, {"_id": 0}
        ).sort("updated_at", -1)
        out = []
        for s in cursor:
            count = collection("messages").count_documents(
                {"session_id": s["session_id"]}
            )
            out.append({**s, "message_count": count})
        return out
    with _lock:
        rows = [s for s in _sessions.values() if s.get("username") == username]
        rows.sort(key=lambda s: s.get("updated_at", ""), reverse=True)
        return [
            {**s, "message_count": len(_messages.get(s["session_id"], []))}
            for s in rows
        ]


def get_session(session_id: str, username: str) -> Optional[dict]:
    """Return a session with its ordered messages, or None if not owned."""
    if mongo_enabled():
        session = collection("sessions").find_one(
            {"session_id": session_id, "username": username}, {"_id": 0}
        )
        if not session:
            return None
        messages = list(
            collection("messages")
            .find({"session_id": session_id}, {"_id": 0})
            .sort("created_at", 1)
        )
        return {**session, "messages": messages}
    with _lock:
        session = _sessions.get(session_id)
        if not session or session.get("username") != username:
            return None
        return {**session, "messages": list(_messages.get(session_id, []))}


def delete_session(session_id: str, username: str) -> bool:
    """Delete a session and its messages. Returns True when something was removed."""
    if mongo_enabled():
        result = collection("sessions").delete_one(
            {"session_id": session_id, "username": username}
        )
        collection("messages").delete_many({"session_id": session_id})
        return result.deleted_count > 0
    with _lock:
        session = _sessions.get(session_id)
        if not session or session.get("username") != username:
            return False
        _sessions.pop(session_id, None)
        _messages.pop(session_id, None)
        return True


def record_feedback(
    session_id: str, rating: str, comment: Optional[str], username: str = ""
) -> dict:
    """Store a feedback rating (Mongo ``feedback`` collection or log only)."""
    record = {
        "session_id": session_id,
        "username": username,
        "rating": rating,
        "comment": comment,
        "timestamp": current_timestamp(),
    }
    if mongo_enabled():
        collection("feedback").insert_one(dict(record))
    logger.info(
        "FEEDBACK session=%s user=%s rating=%s comment=%s",
        session_id,
        username,
        rating,
        comment,
    )
    return record
