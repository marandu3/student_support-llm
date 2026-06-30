"""
RAG (Retrieval-Augmented Generation) engine.

Loads the admin-managed knowledge-base documents (see rag_store), splits them
into overlapping chunks *with character offsets*, embeds them with a
sentence-transformers model (GPU when available, CPU otherwise) and indexes
them in a FAISS vector store for cosine-similarity search.

Because each chunk records its ``doc_id`` and ``start``/``end`` offsets, the
frontend can open the cited document and highlight the exact referenced span.

Public functions:
    load_documents()                  -> list of {doc_id, source, text}
    chunk_documents(documents)        -> list of chunk dicts (with offsets)
    create_vector_store()             -> build/load the main FAISS index
    rebuild_index()                   -> force a rebuild after KB changes
    retrieve_context(query, ...)      -> top-k relevant chunk texts
    retrieve_context_detailed(...)    -> top-k chunks with source metadata
    process_uploaded_file(content, …) -> build a temporary per-session index
"""

import hashlib
import threading
from typing import Dict, List, Optional, Tuple

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

from config import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    EMBEDDING_DEVICE,
    EMBEDDING_MODEL,
    MIN_RELEVANCE_SCORE,
    TOP_K,
)
from logger import logger

# Lazily-initialised globals.
_model: Optional[SentenceTransformer] = None
_model_lock = threading.Lock()

# In-memory temporary stores for inline uploaded files, keyed by session id.
_session_stores: Dict[str, "VectorStore"] = {}


# ---------------------------------------------------------------------------
# Embedding model
# ---------------------------------------------------------------------------

def _resolve_device() -> str:
    """Pick the embedding device: GPU when available, else CPU."""
    if EMBEDDING_DEVICE != "auto":
        return EMBEDDING_DEVICE
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def get_model() -> SentenceTransformer:
    """Return the shared embedding model, loading it on first use."""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                device = _resolve_device()
                logger.info("Loading embedding model '%s' on %s", EMBEDDING_MODEL, device)
                _model = SentenceTransformer(EMBEDDING_MODEL, device=device)
    return _model


def embed(texts: List[str]) -> np.ndarray:
    """Embed texts into L2-normalised float32 vectors (for cosine via dot)."""
    vectors = get_model().encode(
        texts,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    return np.asarray(vectors, dtype="float32")


# ---------------------------------------------------------------------------
# Vector store
# ---------------------------------------------------------------------------

class VectorStore:
    """A FAISS inner-product index over a list of chunk dicts.

    Because embeddings are L2-normalised, inner product equals cosine
    similarity, so scores fall in roughly [-1, 1]. Each chunk dict carries
    ``text`` plus optional ``doc_id`` / ``source`` / ``start`` / ``end``.
    """

    def __init__(self, chunks: List[dict], index: faiss.Index) -> None:
        self.chunks = chunks
        self.index = index

    @classmethod
    def from_chunks(cls, chunks: List[dict]) -> "VectorStore":
        if not chunks:
            dim = get_model().get_sentence_embedding_dimension()
            return cls([], faiss.IndexFlatIP(dim))
        vectors = embed([c["text"] for c in chunks])
        index = faiss.IndexFlatIP(vectors.shape[1])
        index.add(vectors)
        return cls(chunks, index)

    def search(self, query: str, k: int = TOP_K) -> List[Tuple[dict, float]]:
        """Return up to k (chunk, score) pairs ordered by similarity."""
        if not self.chunks:
            return []
        query_vec = embed([query])
        k = min(k, len(self.chunks))
        scores, indices = self.index.search(query_vec, k)
        results: List[Tuple[dict, float]] = []
        for idx, score in zip(indices[0], scores[0]):
            if idx == -1:
                continue
            results.append((self.chunks[int(idx)], float(score)))
        return results


# Main store over the knowledge-base documents (lazily built).
_main_store: Optional[VectorStore] = None
_main_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Document loading & chunking
# ---------------------------------------------------------------------------

def load_documents() -> List[dict]:
    """Load every knowledge-base document as {doc_id, source, text}."""
    from rag_store import get_document_text, list_documents

    documents: List[dict] = []
    for meta in list_documents():
        text = get_document_text(meta["doc_id"])
        if text and text.strip():
            documents.append(
                {"doc_id": meta["doc_id"], "source": meta["filename"], "text": text}
            )
    logger.info("Loaded %d knowledge-base document(s).", len(documents))
    return documents


def chunk_text_spans(
    text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP
) -> List[Tuple[str, int, int]]:
    """Split text into overlapping chunks, returning (chunk, start, end) spans.

    Offsets refer to the original (unstripped) text so the frontend can
    highlight the exact referenced region in the source document.
    """
    if not text:
        return []
    if overlap >= size:
        overlap = size // 2
    spans: List[Tuple[str, int, int]] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + size, n)
        piece = text[start:end]
        if piece.strip():
            spans.append((piece.strip(), start, end))
        start += size - overlap
    return spans


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Backwards-compatible chunker returning only the chunk strings."""
    return [piece for piece, _s, _e in chunk_text_spans(text.strip(), size, overlap)]


def chunk_documents(documents: List[dict]) -> List[dict]:
    """Turn loaded documents into chunk records with source + offset metadata."""
    chunks: List[dict] = []
    for doc in documents:
        for piece, start, end in chunk_text_spans(doc["text"]):
            chunks.append(
                {
                    "doc_id": doc.get("doc_id"),
                    "source": doc["source"],
                    "text": piece,
                    "start": start,
                    "end": end,
                }
            )
    logger.info("Produced %d chunk(s) from documents.", len(chunks))
    return chunks


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _corpus_signature() -> str:
    """A hash of the corpus metadata, used to detect when a rebuild is needed."""
    from rag_store import list_documents

    hasher = hashlib.sha256()
    hasher.update(f"{EMBEDDING_MODEL}|{CHUNK_SIZE}|{CHUNK_OVERLAP}".encode())
    for meta in list_documents():
        hasher.update(str(meta.get("doc_id")).encode())
        hasher.update(str(meta.get("size")).encode())
        hasher.update(str(meta.get("uploaded_at")).encode())
    return hasher.hexdigest()


_signature: Optional[str] = None


def create_vector_store(force_rebuild: bool = False) -> VectorStore:
    """Build (or reuse) the main FAISS index over knowledge-base documents."""
    global _main_store, _signature
    signature = _corpus_signature()
    if _main_store is not None and not force_rebuild and signature == _signature:
        return _main_store
    with _main_lock:
        signature = _corpus_signature()
        if _main_store is not None and not force_rebuild and signature == _signature:
            return _main_store
        documents = load_documents()
        chunks = chunk_documents(documents)
        store = VectorStore.from_chunks(chunks)
        _main_store = store
        _signature = signature

        # Record per-document chunk counts for the admin UI.
        try:
            from rag_store import set_chunk_count

            counts: Dict[str, int] = {}
            for c in chunks:
                if c.get("doc_id"):
                    counts[c["doc_id"]] = counts.get(c["doc_id"], 0) + 1
            for doc in documents:
                set_chunk_count(doc["doc_id"], counts.get(doc["doc_id"], 0))
        except Exception as exc:
            logger.warning("Could not record chunk counts: %s", exc)

        return _main_store


def rebuild_index() -> int:
    """Force a rebuild after the knowledge base changed. Returns chunk count."""
    store = create_vector_store(force_rebuild=True)
    return len(store.chunks)


def warm_up() -> None:
    """Eagerly load the model and build the index (called at startup)."""
    create_vector_store()


def is_ready() -> bool:
    """True when the main index is built and contains chunks."""
    return _main_store is not None and len(_main_store.chunks) > 0


def _gather_results(query: str, session_id: Optional[str], k: int) -> List[Tuple[dict, float]]:
    store = create_vector_store()
    results = store.search(query, k=k)
    if session_id and session_id in _session_stores:
        results += _session_stores[session_id].search(query, k=k)
    results.sort(key=lambda pair: pair[1], reverse=True)
    return results


def retrieve_context_detailed(
    query: str, session_id: Optional[str] = None, k: int = TOP_K
) -> List[dict]:
    """Return up to k relevant chunks with source metadata + score."""
    results = _gather_results(query, session_id, k)
    out: List[dict] = []
    seen = set()
    for chunk, score in results:
        if score < MIN_RELEVANCE_SCORE:
            continue
        text = chunk["text"]
        if text in seen:
            continue
        seen.add(text)
        out.append(
            {
                "text": text,
                "source": chunk.get("source", "uploaded"),
                "doc_id": chunk.get("doc_id"),
                "start": chunk.get("start"),
                "end": chunk.get("end"),
                "score": round(score, 4),
            }
        )
        if len(out) >= k:
            break
    return out


def retrieve_context(
    query: str, session_id: Optional[str] = None, k: int = TOP_K
) -> List[str]:
    """Return up to k relevant chunk texts (backwards-compatible)."""
    return [c["text"] for c in retrieve_context_detailed(query, session_id, k)]


def process_uploaded_file(file_content: str, session_id: str) -> int:
    """Chunk and index an uploaded document as temporary context for a session."""
    chunks = [
        {"source": "uploaded", "doc_id": None, "text": piece, "start": start, "end": end}
        for piece, start, end in chunk_text_spans(file_content)
    ]
    _session_stores[session_id] = VectorStore.from_chunks(chunks)
    logger.info(
        "Indexed uploaded file for session %s (%d chunks).", session_id, len(chunks)
    )
    return len(chunks)


def clear_session_upload(session_id: str) -> None:
    """Drop any temporary uploaded index for a session to free memory."""
    _session_stores.pop(session_id, None)
