"""
Logging configuration.

Logs to both the console and a rotating file (logs/app.log). A small helper,
``log_interaction``, writes a structured one-line record for each question so
that sessions, questions, answers, retrieved context and timing are captured.
"""

import json
import logging
import os
from logging.handlers import RotatingFileHandler
from typing import List, Optional

from config import (
    LOG_BACKUP_COUNT,
    LOG_DIRECTORY,
    LOG_FILE,
    LOG_LEVEL,
    LOG_MAX_BYTES,
)

# --------------------------------------------------
# Create logs folder automatically
# --------------------------------------------------

os.makedirs(LOG_DIRECTORY, exist_ok=True)


# --------------------------------------------------
# Configure logger
# --------------------------------------------------

logger = logging.getLogger("student_support")
logger.setLevel(LOG_LEVEL)

# Prevent duplicate handlers when the module is imported more than once
# (uvicorn reload, tests, etc.).
logger.handlers.clear()
logger.propagate = False

formatter = logging.Formatter(
    fmt="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)


# --------------------------------------------------
# Rotating file handler
# --------------------------------------------------

file_handler = RotatingFileHandler(
    LOG_FILE,
    maxBytes=LOG_MAX_BYTES,
    backupCount=LOG_BACKUP_COUNT,
    encoding="utf-8",
)
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)


# --------------------------------------------------
# Console handler
# --------------------------------------------------

console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)


def log_interaction(
    session_id: str,
    question: str,
    answer: str,
    source: str,
    response_time: float,
    retrieved_context: Optional[List[str]] = None,
) -> None:
    """Write one structured JSON record describing a Q&A interaction."""
    record = {
        "session_id": session_id,
        "question": question,
        "answer": answer,
        "source": source,
        "response_time": response_time,
        "retrieved_context": retrieved_context or [],
    }
    logger.info("INTERACTION %s", json.dumps(record, ensure_ascii=False))


logger.info("Logger initialized successfully.")
