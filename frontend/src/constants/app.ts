import type { ChatMessage } from "../types/chat";

const envBase = import.meta.env.VITE_API_BASE_URL as string | undefined;

export const API_BASE_URL = (envBase?.trim() || "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);

export const TOKEN_STORAGE_KEY = "udsm-auth-token";
export const USER_STORAGE_KEY = "udsm-auth-user";

/** Official UDSM logo (falls back to an inline mark if it can't be loaded). */
export const UDSM_LOGO_URL =
  "https://udsm.ac.tz/sites/default/files/udsm%20logo.png";

export const CONNECTION_ERROR =
  "Connection Error: Unable to reach the server. Please ensure the backend is running.";

export const OFFLINE_NOTICE =
  "The backend is unreachable. Start it (or `docker compose up`) to chat.";

export const HERO_HEADLINE = "How can I help you today?";

export const initialMessages: ChatMessage[] = [];

/** Fallback chips shown if the dynamic /suggestions endpoint is unavailable. */
export const FALLBACK_SUGGESTIONS = [
  "How do I register for courses?",
  "What are the examination rules?",
  "How do I apply for accommodation?",
  "When is the fee payment deadline?",
];
