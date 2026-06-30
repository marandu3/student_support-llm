"""
Custom exceptions used throughout the project.

These are domain-level errors raised by the service / client layers and
translated into HTTP responses by the FastAPI exception handlers.
"""


class AppError(Exception):
    """Base class for all application errors."""
    pass


class LLMConnectionError(AppError):
    """Raised when the backend cannot communicate with Ollama."""
    pass


class ModelNotFoundError(AppError):
    """Raised when the configured model is unavailable in Ollama."""
    pass


class EmptyQuestionError(AppError):
    """Raised when the user submits an empty question."""
    pass


class QuestionTooLongError(AppError):
    """Raised when the question exceeds the maximum allowed length."""
    pass


class UnsupportedFileTypeError(AppError):
    """Raised when an uploaded file has an unsupported extension."""
    pass


class FileTooLargeError(AppError):
    """Raised when an uploaded file exceeds the maximum allowed size."""
    pass


class FAQNotFoundError(AppError):
    """Raised when the FAQ file cannot be loaded."""
    pass


class RAGError(AppError):
    """Raised when the retrieval (RAG) layer fails."""
    pass


class AuthError(AppError):
    """Base class for authentication / authorization errors."""
    pass


class UserExistsError(AuthError):
    """Raised when registering a username that already exists."""
    pass


class InvalidCredentialsError(AuthError):
    """Raised when a login attempt has an unknown user or wrong password."""
    pass
