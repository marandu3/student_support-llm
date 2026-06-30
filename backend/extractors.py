"""
Text extraction for uploaded files.

Turns raw uploaded bytes (txt / md / pdf / docx) into clean plain text that can
be embedded for RAG or used as inline question context. PDF/DOCX support is
optional — if the relevant library is missing, a clear error is raised.
"""

import io
import os
import re

from exceptions import UnsupportedFileTypeError

# Extensions we can extract text from.
TEXT_EXTENSIONS = {".txt", ".md"}
PDF_EXTENSIONS = {".pdf"}
DOCX_EXTENSIONS = {".docx"}
SUPPORTED_EXTENSIONS = TEXT_EXTENSIONS | PDF_EXTENSIONS | DOCX_EXTENSIONS

_SMART_CHARS = {
    "’": "'", "‘": "'", "“": '"', "”": '"',
    "–": "-", "—": "-", "•": "*", "\xa0": " ",
    "�": " ", "\x00": " ",
}


def _clean(text: str) -> str:
    for bad, good in _SMART_CHARS.items():
        text = text.replace(bad, good)
    text = re.sub(r"\.{4,}", " ", text)        # dotted ToC leaders
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _extract_pdf(raw: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - dependency guard
        raise UnsupportedFileTypeError("PDF support requires pypdf") from exc
    reader = PdfReader(io.BytesIO(raw))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _extract_docx(raw: bytes) -> str:
    try:
        import docx  # python-docx
    except ImportError as exc:  # pragma: no cover - dependency guard
        raise UnsupportedFileTypeError("DOCX support requires python-docx") from exc
    document = docx.Document(io.BytesIO(raw))
    return "\n".join(p.text for p in document.paragraphs)


def extract_text(filename: str, raw: bytes) -> str:
    """Extract clean plain text from an uploaded file by its extension."""
    ext = os.path.splitext(filename or "")[1].lower()
    if ext in TEXT_EXTENSIONS:
        text = raw.decode("utf-8", errors="replace")
    elif ext in PDF_EXTENSIONS:
        text = _extract_pdf(raw)
    elif ext in DOCX_EXTENSIONS:
        text = _extract_docx(raw)
    else:
        raise UnsupportedFileTypeError(ext or "<none>")
    return _clean(text)
