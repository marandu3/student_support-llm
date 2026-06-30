import {
  API_BASE_URL,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
} from "../constants/app";
import type {
  AuthResult,
  AuthUser,
  ModelList,
  PullProgress,
  RagDocument,
  Rating,
  RetrievedContext,
  ServerInfo,
  SessionSummary,
} from "../types/chat";
import { RATING_TO_API } from "../types/chat";

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

let authToken: string | null =
  typeof window !== "undefined"
    ? window.localStorage.getItem(TOKEN_STORAGE_KEY)
    : null;

export function getToken() {
  return authToken;
}

export function setToken(token: string | null) {
  authToken = token;
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function storeUser(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  if (user) {
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(USER_STORAGE_KEY);
  }
}

export function loadStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return authToken
    ? { ...extra, Authorization: `Bearer ${authToken}` }
    : { ...extra };
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as Record<string, unknown>;
    const detail = data.detail ?? data.error ?? data.message;
    if (typeof detail === "string" && detail.trim()) return detail;
  } catch {
    /* ignore */
  }
  return `Request failed (${response.status})`;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function register(payload: {
  username: string;
  password: string;
  display_name?: string;
  email?: string;
}): Promise<AuthResult> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  const result = (await response.json()) as AuthResult;
  setToken(result.token);
  storeUser(result.user);
  return result;
}

export async function login(payload: {
  username: string;
  password: string;
}): Promise<AuthResult> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  const result = (await response.json()) as AuthResult;
  setToken(result.token);
  storeUser(result.user);
  return result;
}

export function logout() {
  setToken(null);
  storeUser(null);
}

/** Verify a stored token is still valid; returns the user or null. */
export async function fetchMe(signal?: AbortSignal): Promise<AuthUser | null> {
  if (!authToken) return null;
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: authHeaders(),
    signal,
  });
  if (!response.ok) return null;
  return (await response.json()) as AuthUser;
}

// ---------------------------------------------------------------------------
// Health / model
// ---------------------------------------------------------------------------

export async function checkBackendHealth(
  signal?: AbortSignal,
): Promise<ServerInfo> {
  const response = await fetch(`${API_BASE_URL}/health`, {
    method: "GET",
    signal,
  });
  if (!response.ok) {
    throw new Error(`Backend health returned ${response.status}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  return {
    ollama: typeof data.ollama === "string" ? data.ollama : undefined,
    model: typeof data.model === "string" ? data.model : undefined,
    ragReady: Boolean(data.rag_ready),
  };
}

// ---------------------------------------------------------------------------
// Streaming Q&A via Server-Sent Events (/ask/stream)
// ---------------------------------------------------------------------------

type StreamPayload = {
  question: string;
  session_id?: string | null;
  file_content?: string;
};

type StreamDoneInfo = {
  sessionId: string;
  responseTime?: number;
  tokensPerSecond?: number;
  model?: string;
  contexts?: RetrievedContext[];
};

type StreamHandlers = {
  onSession?: (sessionId: string) => void;
  onToken?: (token: string) => void;
  onDone?: (info: StreamDoneInfo) => void;
  signal?: AbortSignal;
};

/**
 * Stream an answer token-by-token from the backend. Resolves with the full
 * answer text. Throws on transport errors or a backend `error` event so the
 * caller can fall back to demo mode.
 */
export async function streamAnswer(
  payload: StreamPayload,
  handlers: StreamHandlers,
): Promise<{ answer: string; sessionId: string }> {
  const response = await fetch(`${API_BASE_URL}/ask/stream`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      question: payload.question,
      session_id: payload.session_id ?? undefined,
      file_content: payload.file_content,
    }),
    signal: handlers.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(await readError(response));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let sessionId = payload.session_id ?? "";

  const handleEvent = (raw: string) => {
    const dataLines = raw
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    if (dataLines.length === 0) return;

    const json = dataLines.join("\n");
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(json) as Record<string, unknown>;
    } catch {
      return;
    }

    switch (event.type) {
      case "session":
        sessionId = String(event.session_id ?? sessionId);
        handlers.onSession?.(sessionId);
        break;
      case "token": {
        const content = String(event.content ?? "");
        answer += content;
        handlers.onToken?.(content);
        break;
      }
      case "error":
        throw new Error(String(event.detail ?? "Streaming failed"));
      case "done":
        sessionId = String(event.session_id ?? sessionId);
        handlers.onDone?.({
          sessionId,
          responseTime:
            typeof event.response_time === "number"
              ? event.response_time
              : undefined,
          tokensPerSecond:
            typeof event.tokens_per_second === "number"
              ? event.tokens_per_second
              : undefined,
          model: typeof event.model === "string" ? event.model : undefined,
          contexts: Array.isArray(event.retrieved_context)
            ? (event.retrieved_context as RetrievedContext[])
            : undefined,
        });
        break;
      default:
        break;
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separator = buffer.indexOf("\n\n");
    while (separator !== -1) {
      const chunk = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      handleEvent(chunk);
      separator = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim()) handleEvent(buffer);

  return { answer, sessionId };
}

// ---------------------------------------------------------------------------
// Non-streaming Q&A (fallback) and uploads / feedback
// ---------------------------------------------------------------------------

export async function askAssistant(payload: StreamPayload) {
  const response = await fetch(`${API_BASE_URL}/ask`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<unknown>;
}

export async function uploadDocument(
  file: File,
  sessionId?: string | null,
): Promise<{ session_id: string; filename: string; chunks_indexed: number }> {
  const form = new FormData();
  form.append("file", file);
  if (sessionId) form.append("session_id", sessionId);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{
    session_id: string;
    filename: string;
    chunks_indexed: number;
  }>;
}

export async function sendFeedback(
  sessionId: string,
  rating: Rating,
  comment?: string,
) {
  const response = await fetch(`${API_BASE_URL}/feedback`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      session_id: sessionId || "anonymous",
      rating: RATING_TO_API[rating],
      comment,
    }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

// ---------------------------------------------------------------------------
// Models (list / select / pull)
// ---------------------------------------------------------------------------

export async function listModels(signal?: AbortSignal): Promise<ModelList> {
  const response = await fetch(`${API_BASE_URL}/models`, {
    headers: authHeaders(),
    signal,
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as ModelList;
}

export async function selectModel(model: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/model/select`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ model }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { current?: string };
  return data.current ?? model;
}

/** Pull (download) a model, reporting SSE progress. Resolves when complete. */
export async function pullModel(
  model: string,
  onProgress: (progress: PullProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/model/pull`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ model }),
    signal,
  });
  if (!response.ok || !response.body) throw new Error(await readError(response));

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handle = (raw: string) => {
    const data = raw
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("\n");
    if (!data) return;
    try {
      const event = JSON.parse(data) as PullProgress;
      onProgress(event);
      if (event.status === "error") throw new Error(event.detail || "Pull failed");
    } catch (err) {
      if (err instanceof Error && err.message !== "Pull failed") return;
      throw err;
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf("\n\n");
    while (sep !== -1) {
      handle(buffer.slice(0, sep));
      buffer = buffer.slice(sep + 2);
      sep = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim()) handle(buffer);
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export async function fetchSuggestions(
  count = 4,
  signal?: AbortSignal,
): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/suggestions?count=${count}`, {
    headers: authHeaders(),
    signal,
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { suggestions?: string[] };
  return Array.isArray(data.suggestions) ? data.suggestions : [];
}

// ---------------------------------------------------------------------------
// Chat sessions (history sidebar)
// ---------------------------------------------------------------------------

export async function listSessions(
  signal?: AbortSignal,
): Promise<SessionSummary[]> {
  const response = await fetch(`${API_BASE_URL}/sessions`, {
    headers: authHeaders(),
    signal,
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { sessions?: SessionSummary[] };
  return Array.isArray(data.sessions) ? data.sessions : [];
}

export type StoredMessage = {
  role: "user" | "assistant";
  content: string;
  source?: string | null;
  response_time?: number | null;
  tokens_per_second?: number | null;
  model?: string | null;
  contexts?: RetrievedContext[] | null;
  created_at: string;
};

export async function fetchSession(
  sessionId: string,
  signal?: AbortSignal,
): Promise<{ session_id: string; title: string; messages: StoredMessage[] }> {
  const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
    headers: authHeaders(),
    signal,
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{
    session_id: string;
    title: string;
    messages: StoredMessage[];
  }>;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(await readError(response));
  }
}

// ---------------------------------------------------------------------------
// RAG knowledge base (admin)
// ---------------------------------------------------------------------------

export async function listRagDocuments(
  signal?: AbortSignal,
): Promise<{ documents: RagDocument[]; rag_ready: boolean }> {
  const response = await fetch(`${API_BASE_URL}/rag/documents`, {
    headers: authHeaders(),
    signal,
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{
    documents: RagDocument[];
    rag_ready: boolean;
  }>;
}

export async function uploadRagDocument(
  file: File,
): Promise<{ documents: RagDocument[]; rag_ready: boolean }> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE_URL}/rag/documents`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{
    documents: RagDocument[];
    rag_ready: boolean;
  }>;
}

export async function deleteRagDocument(
  docId: string,
): Promise<{ documents: RagDocument[]; rag_ready: boolean }> {
  const response = await fetch(`${API_BASE_URL}/rag/documents/${docId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{
    documents: RagDocument[];
    rag_ready: boolean;
  }>;
}

export async function fetchDocumentText(
  docId: string,
  signal?: AbortSignal,
): Promise<{ doc_id: string; filename: string; text: string }> {
  const response = await fetch(`${API_BASE_URL}/rag/documents/${docId}`, {
    headers: authHeaders(),
    signal,
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{
    doc_id: string;
    filename: string;
    text: string;
  }>;
}
