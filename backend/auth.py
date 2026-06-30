"""
User authentication: registration, login, roles and signed tokens.

Storage is pluggable:
  * When MongoDB is available, users live in the ``users`` collection.
  * Otherwise they are persisted to a JSON file so accounts survive restarts.

Security (standard library only, no extra deps):
  * Passwords are hashed with PBKDF2-HMAC-SHA256 + a per-user random salt.
  * Sessions are stateless, signed tokens (HMAC-SHA256) — a small JWT-like
    envelope: base64url(payload) + "." + hex(signature). The payload carries
    the username and role so the API can authorise without a store lookup.
"""

import base64
import hashlib
import hmac
import json
import os
import threading
import time
import uuid

from config import (
    AUTH_SECRET,
    AUTH_TOKEN_TTL,
    DEFAULT_ADMIN_PASSWORD,
    DEFAULT_ADMIN_USERNAME,
    DEMO_PASSWORD,
    DEMO_USERNAME,
    ROLE_ADMIN,
    ROLE_STUDENT,
    ROLES,
    USERS_FILE,
)
from db import collection, mongo_enabled
from exceptions import InvalidCredentialsError, UserExistsError
from logger import logger

_PBKDF2_ROUNDS = 200_000
_lock = threading.Lock()
_seeded = False


# ---------------------------------------------------------------------------
# Storage backend (Mongo when available, JSON file otherwise)
# ---------------------------------------------------------------------------

def _load_users_file() -> dict:
    if not os.path.exists(USERS_FILE):
        return {}
    try:
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        logger.error("Could not read users file (%s); starting empty.", exc)
        return {}


def _save_users_file(users: dict) -> None:
    os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
    tmp = f"{USERS_FILE}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2)
    os.replace(tmp, USERS_FILE)


def _get_record(username: str) -> dict | None:
    """Fetch a single user record (with password hash) by username."""
    if mongo_enabled():
        return collection("users").find_one({"username": username}, {"_id": 0})
    return _load_users_file().get(username)


def _insert_record(record: dict) -> None:
    """Insert a new user record. Assumes the caller checked for duplicates."""
    if mongo_enabled():
        collection("users").insert_one(dict(record))
        return
    users = _load_users_file()
    users[record["username"]] = record
    _save_users_file(users)


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

def _hash_password(password: str, salt: bytes) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ROUNDS)
    return digest.hex()


def _make_password_record(password: str) -> str:
    salt = os.urandom(16)
    return f"{salt.hex()}${_hash_password(password, salt)}"


def _verify_password(password: str, record: str) -> bool:
    try:
        salt_hex, expected = record.split("$", 1)
    except ValueError:
        return False
    candidate = _hash_password(password, bytes.fromhex(salt_hex))
    return hmac.compare_digest(candidate, expected)


# ---------------------------------------------------------------------------
# Tokens (stateless, HMAC-signed)
# ---------------------------------------------------------------------------

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign(payload_b64: str) -> str:
    return hmac.new(
        AUTH_SECRET.encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256
    ).hexdigest()


def create_token(username: str, issued_at: float, role: str = ROLE_STUDENT) -> str:
    """Create a signed token. issued_at is passed in (no Date.now in callers)."""
    payload = {
        "sub": username,
        "role": role,
        "iat": int(issued_at),
        "exp": int(issued_at) + AUTH_TOKEN_TTL,
    }
    payload_b64 = _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{payload_b64}.{_sign(payload_b64)}"


def decode_token(token: str) -> dict | None:
    """Return the token payload if valid and unexpired, else None."""
    if not token or "." not in token:
        return None
    payload_b64, signature = token.rsplit(".", 1)
    if not hmac.compare_digest(signature, _sign(payload_b64)):
        return None
    try:
        payload = json.loads(_b64url_decode(payload_b64))
    except (ValueError, json.JSONDecodeError):
        return None
    if payload.get("exp", 0) < time.time():
        return None
    return payload


def verify_token(token: str) -> str | None:
    """Return the username if the token is valid and unexpired, else None."""
    payload = decode_token(token)
    return payload.get("sub") if payload else None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _public_user(record: dict) -> dict:
    return {
        "username": record["username"],
        "display_name": record.get("display_name") or record["username"],
        "email": record.get("email", ""),
        "role": record.get("role", ROLE_STUDENT),
        "created_at": record.get("created_at", ""),
    }


def register_user(
    username: str,
    password: str,
    display_name: str = "",
    email: str = "",
    role: str = ROLE_STUDENT,
) -> dict:
    """Create a new account. Raises UserExistsError if the username is taken."""
    username = username.strip().lower()
    if role not in ROLES:
        role = ROLE_STUDENT
    with _lock:
        if _get_record(username) is not None:
            raise UserExistsError(username)
        record = {
            "username": username,
            "display_name": display_name.strip() or username,
            "email": email.strip(),
            "role": role,
            "password": _make_password_record(password),
            "created_at": _now_iso(),
            "id": uuid.uuid4().hex,
        }
        _insert_record(record)
    logger.info("Registered new user: %s (role=%s)", username, role)
    return _public_user(record)


def authenticate(username: str, password: str) -> dict:
    """Verify credentials, returning the public user. Raises on failure."""
    username = username.strip().lower()
    record = _get_record(username)
    if not record or not _verify_password(password, record["password"]):
        raise InvalidCredentialsError()
    return _public_user(record)


def get_user(username: str) -> dict | None:
    record = _get_record((username or "").strip().lower())
    return _public_user(record) if record else None


def is_admin(username: str) -> bool:
    user = get_user(username)
    return bool(user and user.get("role") == ROLE_ADMIN)


def seed_default_accounts() -> None:
    """Create the admin + demo accounts on first run if they don't exist."""
    global _seeded
    if _seeded:
        return
    _seeded = True
    try:
        if _get_record(DEFAULT_ADMIN_USERNAME) is None:
            register_user(
                DEFAULT_ADMIN_USERNAME,
                DEFAULT_ADMIN_PASSWORD,
                display_name="Administrator",
                role=ROLE_ADMIN,
            )
            logger.info("Seeded default admin account '%s'.", DEFAULT_ADMIN_USERNAME)
        if _get_record(DEMO_USERNAME) is None:
            register_user(
                DEMO_USERNAME,
                DEMO_PASSWORD,
                display_name="Demo Student",
                role=ROLE_STUDENT,
            )
            logger.info("Seeded demo account '%s'.", DEMO_USERNAME)
    except Exception as exc:
        logger.warning("Could not seed default accounts: %s", exc)


def _now_iso() -> str:
    # Local import keeps the module's import graph small.
    from utils import current_timestamp

    return current_timestamp()
