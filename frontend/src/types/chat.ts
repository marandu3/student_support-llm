export type Rating = "Good" | "Average" | "Poor";

/** Maps UI rating labels to the backend's lowercase enum. */
export const RATING_TO_API: Record<Rating, "good" | "average" | "poor"> = {
  Good: "good",
  Average: "average",
  Poor: "poor",
};

export type BackendStatus = "checking" | "online" | "offline";

/** A retrieved RAG chunk with enough metadata to open + highlight the source. */
export type RetrievedContext = {
  text: string;
  source: string;
  doc_id: string | null;
  start: number | null;
  end: number | null;
  score?: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  isStreaming?: boolean;
  isError?: boolean;
  source?: string;
  responseTime?: number;
  tokensPerSecond?: number;
  model?: string;
  contexts?: RetrievedContext[];
  feedback?: Rating;
  feedbackStatus?: "sending" | "sent" | "error";
};

export type UploadedDocument = {
  name: string;
  content: string;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  document: UploadedDocument | null;
  /** Session id assigned by the backend (used for feedback + RAG continuity). */
  backendSessionId: string | null;
  createdAt: string;
  updatedAt: string;
  isLoading: boolean;
};

export type Role = "admin" | "student";

export type AuthUser = {
  username: string;
  display_name: string;
  email?: string;
  role?: Role;
  created_at?: string;
};

/** A chat session summary as returned by GET /sessions. */
export type SessionSummary = {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
};

/** Metadata for a knowledge-base document (admin RAG manager). */
export type RagDocument = {
  doc_id: string;
  filename: string;
  size: number;
  chunks: number;
  uploaded_by: string;
  uploaded_at: string;
};

export type AuthResult = {
  token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
};

export type ServerInfo = {
  ollama?: string;
  model?: string;
  ragReady?: boolean;
};

export type OllamaModel = {
  name: string;
  size: number | null;
  modified_at: string | null;
  parameter_size: string | null;
};

export type ModelList = {
  current: string;
  available: OllamaModel[];
};

export type PullProgress = {
  status: string;
  completed?: number | null;
  total?: number | null;
  done?: boolean;
  detail?: string;
};
