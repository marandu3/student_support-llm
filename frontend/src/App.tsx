import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkBackendHealth,
  deleteSession as apiDeleteSession,
  fetchSession,
  fetchSuggestions,
  listSessions,
  loadStoredUser,
  logout as apiLogout,
  sendFeedback,
  streamAnswer,
  uploadDocument,
  fetchMe,
  type StoredMessage,
} from "./api/client";
import { ChatArea } from "./components/Chat/ChatArea";
import { LoginScreen } from "./components/Login/LoginScreen";
import { ModelManager } from "./components/Models/ModelManager";
import { DocumentViewer } from "./components/Rag/DocumentViewer";
import { RagManager } from "./components/Rag/RagManager";
import { LeftSidebar } from "./components/Sidebar/LeftSidebar";
import { FALLBACK_SUGGESTIONS, OFFLINE_NOTICE } from "./constants/app";
import type {
  AuthUser,
  BackendStatus,
  ChatMessage,
  RetrievedContext,
  SessionSummary,
  UploadedDocument,
} from "./types/chat";
import { getMessageId } from "./utils/messages";

type Modal = "models" | "admin" | null;

function storedToMessage(m: StoredMessage): ChatMessage {
  return {
    id: getMessageId(m.role),
    role: m.role,
    content: m.content,
    createdAt: m.created_at,
    source: m.source ?? undefined,
    responseTime: m.response_time ?? undefined,
    tokensPerSecond: m.tokens_per_second ?? undefined,
    model: m.model ?? undefined,
    contexts: m.contexts ?? undefined,
  };
}

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [connectionError, setConnectionError] = useState("");
  const [currentModel, setCurrentModel] = useState("");

  const [sessionList, setSessionList] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [document, setDocument] = useState<UploadedDocument | null>(null);

  const [input, setInput] = useState("");
  const [validationError, setValidationError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [suggestions, setSuggestions] = useState<string[]>(FALLBACK_SUGGESTIONS);
  const [modal, setModal] = useState<Modal>(null);
  const [sourceContext, setSourceContext] = useState<RetrievedContext | null>(null);

  const patchMessage = useCallback(
    (messageId: string, patch: Partial<ChatMessage>) => {
      setMessages((current) =>
        current.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
      );
    },
    [],
  );

  const refreshSessions = useCallback(async () => {
    try {
      setSessionList(await listSessions());
    } catch {
      /* ignore — sidebar just stays as-is */
    }
  }, []);

  const refreshSuggestions = useCallback(async () => {
    try {
      const next = await fetchSuggestions(4);
      if (next.length) setSuggestions(next);
    } catch {
      /* keep fallbacks */
    }
  }, []);

  // Restore a stored session on first load.
  useEffect(() => {
    const controller = new AbortController();
    async function restore() {
      const stored = loadStoredUser();
      if (stored) {
        const verified = await fetchMe(controller.signal).catch(() => null);
        setUser(verified ?? stored);
      }
      setAuthChecked(true);
    }
    void restore();
    return () => controller.abort();
  }, []);

  // Poll backend health + load sidebar data while authenticated.
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();

    async function check() {
      try {
        const info = await checkBackendHealth(controller.signal);
        const model = info.model ? info.model.split(" ")[0] : "";
        if (model) setCurrentModel(model);
        setBackendStatus("online");
        setConnectionError("");
      } catch {
        if (!controller.signal.aborted) {
          setBackendStatus("offline");
          setConnectionError(OFFLINE_NOTICE);
        }
      }
    }

    void check();
    void refreshSessions();
    void refreshSuggestions();
    const interval = window.setInterval(check, 20000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [user, refreshSessions, refreshSuggestions]);

  function startNewChat() {
    setActiveSessionId(null);
    setMessages([]);
    setDocument(null);
    setInput("");
    setValidationError("");
  }

  async function handleSelectChat(sessionId: string) {
    if (sessionId === activeSessionId) return;
    try {
      const detail = await fetchSession(sessionId);
      setMessages(detail.messages.map(storedToMessage));
      setActiveSessionId(sessionId);
      setDocument(null);
      setInput("");
      setValidationError("");
    } catch {
      setConnectionError("Could not load that conversation.");
    }
  }

  async function handleDeleteChat(sessionId: string) {
    await apiDeleteSession(sessionId).catch(() => undefined);
    if (sessionId === activeSessionId) startNewChat();
    void refreshSessions();
  }

  function handleLogout() {
    apiLogout();
    setUser(null);
    setSessionList([]);
    startNewChat();
  }

  async function handleUploadFile(file: File) {
    try {
      const result = await uploadDocument(file, activeSessionId);
      setActiveSessionId(result.session_id);
      setDocument({ name: file.name, content: "" });
    } catch {
      // Offline / rejected: keep the text inline so questions still have context.
      const content = await file.text();
      setDocument({ name: file.name, content });
    }
  }

  function handleDocumentClear() {
    setDocument(null);
  }

  async function handleSend() {
    const question = input.trim();
    if (!question) {
      setValidationError("Please enter a question.");
      return;
    }
    if (isLoading) return;
    setValidationError("");

    const inlineContent = document?.content.trim() ? document.content : undefined;

    const userMessage: ChatMessage = {
      id: getMessageId("user"),
      role: "user",
      content: question,
      createdAt: new Date().toISOString(),
    };
    const assistantMessage: ChatMessage = {
      id: getMessageId("assistant"),
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      isStreaming: true,
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");
    setIsLoading(true);

    try {
      await streamAnswer(
        {
          question,
          session_id: activeSessionId,
          file_content: inlineContent,
        },
        {
          onSession: (sid) => setActiveSessionId(sid),
          onToken: (token) =>
            setMessages((current) =>
              current.map((m) =>
                m.id === assistantMessage.id
                  ? { ...m, content: m.content + token }
                  : m,
              ),
            ),
          onDone: ({ responseTime, tokensPerSecond, model, contexts }) =>
            patchMessage(assistantMessage.id, {
              responseTime,
              tokensPerSecond,
              model,
              contexts,
              source: "LLM",
              isStreaming: false,
            }),
        },
      );
      setBackendStatus("online");
      setConnectionError("");
      patchMessage(assistantMessage.id, { isStreaming: false });
      void refreshSessions();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "The assistant is unavailable.";
      patchMessage(assistantMessage.id, {
        content:
          /failed to fetch|networkerror|load failed/i.test(message)
            ? "I couldn't reach the backend. Please ensure it's running (or run `docker compose up`) and try again."
            : message,
        isStreaming: false,
        isError: true,
      });
      setBackendStatus("offline");
      setConnectionError(OFFLINE_NOTICE);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleFeedback(messageId: string, rating: ChatMessage["feedback"]) {
    if (!rating) return;
    patchMessage(messageId, { feedback: rating, feedbackStatus: "sending" });
    const status = await sendFeedback(activeSessionId ?? "anonymous", rating)
      .then(() => "sent" as const)
      .catch(() => "error" as const);
    patchMessage(messageId, { feedbackStatus: status });
  }

  // Re-run suggestions when the model changes (kept stable across renders).
  const onModelChanged = useRef((model: string) => {
    setCurrentModel(model);
  }).current;

  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="size-10 animate-spin rounded-full border-2 border-[color:var(--brand-500)]/30 border-t-[color:var(--brand-500)]" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onAuthenticated={setUser} />;
  }

  return (
    <div className="h-screen overflow-hidden lg:pl-[19rem]">
      <LeftSidebar
        sessions={sessionList}
        activeSessionId={activeSessionId}
        user={user}
        currentModel={currentModel}
        backendStatus={backendStatus}
        onNewChat={startNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        onOpenModels={() => setModal("models")}
        onOpenAdmin={() => setModal("admin")}
        onLogout={handleLogout}
      />

      <ChatArea
        input={input}
        setInput={setInput}
        messages={messages}
        isLoading={isLoading}
        validationError={validationError}
        connectionError={connectionError}
        backendStatus={backendStatus}
        document={document}
        suggestions={suggestions}
        currentModel={currentModel}
        onSend={handleSend}
        onFeedback={handleFeedback}
        onUploadFile={handleUploadFile}
        onDocumentClear={handleDocumentClear}
        onOpenSource={setSourceContext}
        onOpenModels={() => setModal("models")}
        onRefreshSuggestions={refreshSuggestions}
      />

      {modal === "models" ? (
        <ModelManager
          onClose={() => setModal(null)}
          onModelChanged={onModelChanged}
        />
      ) : null}

      {modal === "admin" ? <RagManager onClose={() => setModal(null)} /> : null}

      {sourceContext ? (
        <DocumentViewer
          context={sourceContext}
          onClose={() => setSourceContext(null)}
        />
      ) : null}
    </div>
  );
}

export default App;
