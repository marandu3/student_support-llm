"""
Knowledge-base document store (the corpus admins manage for RAG).

Each document's *extracted plain text* is written to ``KB_DIR/{doc_id}.txt`` so
character offsets recorded at chunking time line up exactly with what the
source-reference viewer later displays. Document metadata is kept in MongoDB
(``rag_documents``) when available, otherwise in a JSON file.

Adding or deleting a document rebuilds the FAISS index (see rag_engine).
"""

import json
import os
import threading
import uuid
from typing import List, Optional

from config import KB_DIR, RAG_DOCS_FILE
from db import collection, mongo_enabled
from extractors import extract_text
from logger import logger
from utils import current_timestamp

_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Metadata persistence (Mongo or JSON file)
# ---------------------------------------------------------------------------

def _load_meta() -> List[dict]:
    if mongo_enabled():
        return list(collection("rag_documents").find({}, {"_id": 0}))
    if not os.path.exists(RAG_DOCS_FILE):
        return []
    try:
        with open(RAG_DOCS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return []


def _save_meta_file(docs: List[dict]) -> None:
    os.makedirs(os.path.dirname(RAG_DOCS_FILE), exist_ok=True)
    tmp = f"{RAG_DOCS_FILE}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(docs, f, indent=2)
    os.replace(tmp, RAG_DOCS_FILE)


def _insert_meta(record: dict) -> None:
    if mongo_enabled():
        collection("rag_documents").insert_one(dict(record))
        return
    docs = _load_meta()
    docs.append(record)
    _save_meta_file(docs)


def _delete_meta(doc_id: str) -> bool:
    if mongo_enabled():
        return collection("rag_documents").delete_one({"doc_id": doc_id}).deleted_count > 0
    docs = _load_meta()
    remaining = [d for d in docs if d.get("doc_id") != doc_id]
    if len(remaining) == len(docs):
        return False
    _save_meta_file(remaining)
    return True


# ---------------------------------------------------------------------------
# Files on disk
# ---------------------------------------------------------------------------

def _text_path(doc_id: str) -> str:
    return os.path.join(KB_DIR, f"{doc_id}.txt")


def list_documents() -> List[dict]:
    """Return document metadata, newest first."""
    docs = _load_meta()
    docs.sort(key=lambda d: d.get("uploaded_at", ""), reverse=True)
    return docs


def get_document_text(doc_id: str) -> Optional[str]:
    """Return the stored plain text of a document, or None when missing."""
    path = _text_path(doc_id)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def get_document_meta(doc_id: str) -> Optional[dict]:
    for d in _load_meta():
        if d.get("doc_id") == doc_id:
            return d
    return None


def add_document(filename: str, raw: bytes, uploaded_by: str = "") -> dict:
    """Extract, persist and register a new knowledge-base document.

    Returns the metadata record. Raises on unsupported / empty files.
    The caller is responsible for rebuilding the index afterwards.
    """
    text = extract_text(filename, raw)  # raises UnsupportedFileTypeError on bad type
    if not text.strip():
        from exceptions import RAGError

        raise RAGError(f"No extractable text found in '{filename}'.")

    doc_id = uuid.uuid4().hex
    os.makedirs(KB_DIR, exist_ok=True)
    with _lock:
        with open(_text_path(doc_id), "w", encoding="utf-8") as f:
            f.write(text)
        record = {
            "doc_id": doc_id,
            "filename": filename,
            "size": len(text),
            "chunks": 0,  # filled in after indexing
            "uploaded_by": uploaded_by,
            "uploaded_at": current_timestamp(),
        }
        _insert_meta(record)
    logger.info("Added KB document '%s' (doc_id=%s, %d chars).", filename, doc_id, len(text))
    return record


def set_chunk_count(doc_id: str, chunks: int) -> None:
    if mongo_enabled():
        collection("rag_documents").update_one(
            {"doc_id": doc_id}, {"$set": {"chunks": chunks}}
        )
        return
    docs = _load_meta()
    for d in docs:
        if d.get("doc_id") == doc_id:
            d["chunks"] = chunks
    _save_meta_file(docs)


def delete_document(doc_id: str) -> bool:
    """Remove a document's text + metadata. Returns True when it existed."""
    with _lock:
        removed = _delete_meta(doc_id)
        path = _text_path(doc_id)
        if os.path.exists(path):
            os.remove(path)
    if removed:
        logger.info("Deleted KB document %s.", doc_id)
    return removed
