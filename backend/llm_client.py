"""
Communicates with Ollama.

Provides the system-prompt builder, a synchronous completion call, an async
streaming generator (for SSE) and helpers to inspect available models.
"""

from typing import AsyncGenerator, Dict, List, Optional

import ollama
from ollama import AsyncClient

from config import MODEL_NAME, OLLAMA_HOST
from exceptions import LLMConnectionError, ModelNotFoundError
from logger import logger
from prompts import build_system_prompt

# The active model can be changed at runtime from the UI (/model/select);
# it defaults to the configured MODEL_NAME.
_current_model = MODEL_NAME


def get_current_model() -> str:
    """Return the model currently used for answering."""
    return _current_model


def set_current_model(model: str) -> str:
    """Set the active model. Returns the new value."""
    global _current_model
    _current_model = model.strip()
    logger.info("Active model set to '%s'.", _current_model)
    return _current_model


def create_system_prompt(context: Optional[str]) -> str:
    """Build the improved, context-aware system prompt."""
    return build_system_prompt(context)


def _build_messages(question: str, context: Optional[str]) -> list:
    return [
        {"role": "system", "content": create_system_prompt(context)},
        {"role": "user", "content": question},
    ]


def get_ollama_models() -> List[str]:
    """Return the list of model names available in Ollama.

    Raises:
        LLMConnectionError: when Ollama cannot be reached.
    """
    try:
        data = ollama.list()
    except Exception as exc:  # ConnectionError and friends
        raise LLMConnectionError(str(exc))

    models = getattr(data, "models", None)
    if models is None and isinstance(data, dict):
        models = data.get("models", [])

    names: List[str] = []
    for item in models or []:
        name = getattr(item, "model", None)
        if name is None and isinstance(item, dict):
            name = item.get("model") or item.get("name")
        if name:
            names.append(name)
    return names


def list_models_detailed() -> List[Dict]:
    """Return installed models with name + size + modified time for the UI.

    Raises:
        LLMConnectionError: when Ollama cannot be reached.
    """
    try:
        data = ollama.list()
    except Exception as exc:
        raise LLMConnectionError(str(exc))

    raw = getattr(data, "models", None)
    if raw is None and isinstance(data, dict):
        raw = data.get("models", [])

    models: List[Dict] = []
    for item in raw or []:
        def field(name: str):
            value = getattr(item, name, None)
            if value is None and isinstance(item, dict):
                value = item.get(name)
            return value

        name = field("model") or field("name")
        if not name:
            continue
        size = field("size")
        modified = field("modified_at")
        details = field("details")
        param_size = None
        if details is not None:
            param_size = getattr(details, "parameter_size", None)
            if param_size is None and isinstance(details, dict):
                param_size = details.get("parameter_size")
        models.append(
            {
                "name": name,
                "size": int(size) if isinstance(size, (int, float)) else None,
                "modified_at": str(modified) if modified else None,
                "parameter_size": param_size,
            }
        )
    return models


async def pull_model(model: str) -> AsyncGenerator[Dict, None]:
    """Pull (download) a model from the Ollama registry, yielding progress.

    Each yielded dict carries status text and, when known, completed/total
    byte counts so the UI can render a progress bar.
    """
    client = AsyncClient(host=OLLAMA_HOST)
    try:
        async for chunk in await client.pull(model, stream=True):
            status = getattr(chunk, "status", None)
            completed = getattr(chunk, "completed", None)
            total = getattr(chunk, "total", None)
            if isinstance(chunk, dict):
                status = chunk.get("status", status)
                completed = chunk.get("completed", completed)
                total = chunk.get("total", total)
            yield {
                "status": status or "downloading",
                "completed": int(completed) if isinstance(completed, (int, float)) else None,
                "total": int(total) if isinstance(total, (int, float)) else None,
            }
    except ollama.ResponseError as exc:
        raise ModelNotFoundError(str(exc))
    except Exception as exc:
        raise LLMConnectionError(str(exc))


def model_available(model: Optional[str] = None) -> bool:
    """True when `model` (ignoring any :tag) is installed in Ollama."""
    model = model or get_current_model()
    try:
        available = get_ollama_models()
    except LLMConnectionError:
        return False
    base = model.split(":")[0]
    return any(name == model or name.split(":")[0] == base for name in available)


def ask_llm(question: str, context: Optional[str] = None, model: Optional[str] = None) -> str:
    """Synchronous completion. Returns the assistant's full reply text."""
    messages = _build_messages(question, context)
    try:
        response = ollama.chat(model=model or get_current_model(), messages=messages)
    except ollama.ResponseError as exc:
        logger.error("Ollama response error: %s", exc)
        raise ModelNotFoundError(str(exc))
    except Exception as exc:
        logger.error("Ollama connection error: %s", exc)
        raise LLMConnectionError(str(exc))
    return response["message"]["content"]


async def stream_llm(
    question: str,
    context: Optional[str] = None,
    model: Optional[str] = None,
    metrics: Optional[Dict] = None,
) -> AsyncGenerator[str, None]:
    """Async generator yielding text chunks from Ollama's streaming response.

    When a `metrics` dict is supplied, it is populated from the final chunk
    with Ollama's eval_count / eval_duration so callers can report tokens/sec.
    """
    messages = _build_messages(question, context)
    client = AsyncClient(host=OLLAMA_HOST)
    try:
        stream = await client.chat(
            model=model or get_current_model(), messages=messages, stream=True
        )
        async for chunk in stream:
            content = chunk["message"]["content"]
            if content:
                yield content
            if metrics is not None and chunk.get("done"):
                for key in ("eval_count", "eval_duration", "prompt_eval_count"):
                    value = chunk.get(key)
                    if value is not None:
                        metrics[key] = value
    except ollama.ResponseError as exc:
        logger.error("Ollama streaming response error: %s", exc)
        raise ModelNotFoundError(str(exc))
    except Exception as exc:
        logger.error("Ollama streaming connection error: %s", exc)
        raise LLMConnectionError(str(exc))
