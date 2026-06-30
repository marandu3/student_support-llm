"""
Helper functions: timestamps, session ids, FAQ lookup and upload validation.
"""

import json
import os
import uuid
from datetime import datetime, timezone

from config import (
    ALLOWED_FILE_EXTENSIONS,
    FAQ_FILE,
    MAX_FILE_SIZE,
)
from exceptions import FileTooLargeError, UnsupportedFileTypeError


def current_timestamp() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_session_id() -> str:
    """Generate a new random session id."""
    return uuid.uuid4().hex


def load_faq() -> list:
    """Load the FAQ entries from disk, returning [] when missing."""
    if not os.path.exists(FAQ_FILE):
        return []
    with open(FAQ_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def search_faq(question: str):
    """Return a canned FAQ answer when a keyword matches, else None."""
    faq = load_faq()
    question = question.lower()
    for item in faq:
        if item["question"].lower() in question:
            return item["answer"]
    return None


def validate_upload(
    filename: str, content: bytes, max_size: int = MAX_FILE_SIZE
) -> None:
    """Validate an uploaded file's extension and size.

    Args:
        max_size: maximum allowed size in bytes (defaults to MAX_FILE_SIZE).

    Raises:
        UnsupportedFileTypeError: extension not in the allow-list.
        FileTooLargeError: content exceeds max_size. The message carries
            "<size>/<limit>" so callers can report the actual limit.
    """
    extension = os.path.splitext(filename or "")[1].lower()
    if extension not in ALLOWED_FILE_EXTENSIONS:
        raise UnsupportedFileTypeError(extension or "<none>")
    if len(content) > max_size:
        raise FileTooLargeError(f"{len(content)}/{max_size}")
