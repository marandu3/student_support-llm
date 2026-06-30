"""
API tests for the UDSM Student Support Assistant.

Can be run two ways:
  * As a standalone script:  python tests/test_api.py
    -> prints PASS/FAIL + response times and writes tests/test_results.txt
  * With pytest:             pytest tests/test_api.py

Both require the backend to be running (uvicorn main:app) and Ollama to be up.
"""

import io
import os
import time
import uuid

import requests

BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:8000")
RESULTS_FILE = os.path.join(os.path.dirname(__file__), "test_results.txt")

# If the server is running with auth enabled, set API_KEY in the test env too.
API_KEY = os.getenv("API_KEY", "").strip()
HEADERS = {"X-API-Key": API_KEY} if API_KEY else {}


# ---------------------------------------------------------------------------
# Individual checks (also usable as pytest tests)
# ---------------------------------------------------------------------------

def test_health():
    r = requests.get(f"{BASE_URL}/health", timeout=30)
    assert r.status_code == 200
    assert r.json()["backend"] == "running"


def test_root():
    r = requests.get(BASE_URL, timeout=30)
    assert r.status_code == 200


def test_ask_valid():
    r = requests.post(
        f"{BASE_URL}/ask",
        json={"question": "How do I register for courses?"},
        headers=HEADERS,
        timeout=180,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["answer"]
    assert body["session_id"]


def test_ask_stream():
    with requests.post(
        f"{BASE_URL}/ask/stream",
        json={"question": "When does Semester I begin?"},
        headers=HEADERS,
        stream=True,
        timeout=180,
    ) as r:
        assert r.status_code == 200
        received = False
        for line in r.iter_lines():
            if line and line.decode("utf-8").startswith("data:"):
                received = True
                break
        assert received


def test_ask_empty():
    r = requests.post(
        f"{BASE_URL}/ask", json={"question": "   "}, headers=HEADERS, timeout=30
    )
    assert r.status_code == 400


def test_ask_special_characters():
    r = requests.post(
        f"{BASE_URL}/ask",
        json={"question": "Wapi ofisi ya usajili? (registration) — café #1 @UDSM?"},
        headers=HEADERS,
        timeout=180,
    )
    assert r.status_code == 200
    assert r.json()["answer"]


def test_upload_txt():
    content = b"UDSM special club meets every Friday at 3pm in the main hall."
    files = {"file": ("note.txt", io.BytesIO(content), "text/plain")}
    r = requests.post(f"{BASE_URL}/upload", files=files, headers=HEADERS, timeout=120)
    assert r.status_code == 200
    body = r.json()
    assert body["chunks_indexed"] >= 1
    assert body["session_id"]


def test_upload_unsupported_type():
    files = {"file": ("malware.exe", io.BytesIO(b"binary"), "application/octet-stream")}
    r = requests.post(f"{BASE_URL}/upload", files=files, headers=HEADERS, timeout=30)
    assert r.status_code == 400


def test_feedback():
    r = requests.post(
        f"{BASE_URL}/feedback",
        json={"session_id": "test-session", "rating": "good", "comment": "Helpful!"},
        headers=HEADERS,
        timeout=30,
    )
    assert r.status_code == 200


def test_feedback_invalid_rating():
    r = requests.post(
        f"{BASE_URL}/feedback",
        json={"session_id": "test-session", "rating": "superb"},
        headers=HEADERS,
        timeout=30,
    )
    assert r.status_code == 400


def test_model():
    r = requests.get(f"{BASE_URL}/model", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert body["model"]
    assert "installed" in body


def test_history_get():
    r = requests.get(f"{BASE_URL}/history", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    assert "history" in r.json()


def test_sessions_list():
    r = requests.get(f"{BASE_URL}/sessions", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    assert "sessions" in r.json()


def test_session_delete_missing():
    r = requests.delete(
        f"{BASE_URL}/sessions/does-not-exist", headers=HEADERS, timeout=30
    )
    assert r.status_code == 404


def test_suggestions():
    r = requests.get(f"{BASE_URL}/suggestions?count=4", timeout=60)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["suggestions"], list)
    assert len(body["suggestions"]) >= 1


def test_rag_documents_list():
    r = requests.get(f"{BASE_URL}/rag/documents", headers=HEADERS, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert "documents" in body
    assert "rag_ready" in body


def test_auth_enforced():
    """A protected endpoint must reject a missing key iff auth is configured."""
    r = requests.get(f"{BASE_URL}/model", timeout=30)  # deliberately no header
    if API_KEY:
        assert r.status_code == 401
    else:
        assert r.status_code == 200


def test_auth_register_and_login():
    """Registration issues a token; the same credentials then log in."""
    username = f"test_{uuid.uuid4().hex[:10]}"
    password = "secret123"

    reg = requests.post(
        f"{BASE_URL}/auth/register",
        json={"username": username, "password": password, "display_name": "Test"},
        timeout=30,
    )
    assert reg.status_code == 200
    body = reg.json()
    assert body["token"]
    assert body["user"]["username"] == username

    # Duplicate registration is rejected.
    dup = requests.post(
        f"{BASE_URL}/auth/register",
        json={"username": username, "password": password},
        timeout=30,
    )
    assert dup.status_code == 409

    # Login with the same credentials succeeds and /auth/me echoes the user.
    login = requests.post(
        f"{BASE_URL}/auth/login",
        json={"username": username, "password": password},
        timeout=30,
    )
    assert login.status_code == 200
    token = login.json()["token"]

    me = requests.get(
        f"{BASE_URL}/auth/me",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    assert me.status_code == 200
    assert me.json()["username"] == username


def test_auth_login_invalid():
    """Bad credentials are rejected with 401."""
    r = requests.post(
        f"{BASE_URL}/auth/login",
        json={"username": "does_not_exist_xyz", "password": "whatever"},
        timeout=30,
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Standalone runner with PASS/FAIL reporting
# ---------------------------------------------------------------------------

TESTS = [
    ("GET /health", test_health),
    ("GET /", test_root),
    ("POST /ask (valid)", test_ask_valid),
    ("POST /ask/stream", test_ask_stream),
    ("POST /ask (empty -> 400)", test_ask_empty),
    ("POST /ask (special chars)", test_ask_special_characters),
    ("POST /upload (.txt)", test_upload_txt),
    ("POST /upload (bad type -> 400)", test_upload_unsupported_type),
    ("POST /feedback", test_feedback),
    ("POST /feedback (bad rating -> 400)", test_feedback_invalid_rating),
    ("GET /model", test_model),
    ("GET /history", test_history_get),
    ("GET /sessions", test_sessions_list),
    ("DELETE /sessions (missing -> 404)", test_session_delete_missing),
    ("GET /suggestions", test_suggestions),
    ("GET /rag/documents", test_rag_documents_list),
    ("Auth enforcement", test_auth_enforced),
    ("POST /auth/register + login", test_auth_register_and_login),
    ("POST /auth/login (bad -> 401)", test_auth_login_invalid),
]


def run_all() -> None:
    lines = [f"UDSM Student Support Assistant - API Test Results", f"Target: {BASE_URL}", ""]
    passed = 0
    for name, fn in TESTS:
        start = time.time()
        try:
            fn()
            elapsed = time.time() - start
            line = f"[PASS] {name:35s} ({elapsed:.2f}s)"
            passed += 1
        except Exception as exc:
            elapsed = time.time() - start
            line = f"[FAIL] {name:35s} ({elapsed:.2f}s) -> {exc}"
        print(line)
        lines.append(line)

    summary = f"\n{passed}/{len(TESTS)} tests passed."
    print(summary)
    lines.append(summary)

    with open(RESULTS_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"Results written to {RESULTS_FILE}")


if __name__ == "__main__":
    run_all()
