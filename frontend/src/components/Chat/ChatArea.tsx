import { ChevronDown, FileText, RefreshCw, Send } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useEffect, useRef } from "react";
import { HERO_HEADLINE } from "../../constants/app";
import type {
  BackendStatus,
  ChatMessage,
  Rating,
  RetrievedContext,
  UploadedDocument,
} from "../../types/chat";
import { Logo } from "../Logo";
import { ThemeToggle } from "../ThemeToggle";
import { DocumentUpload } from "./DocumentUpload";
import { MessageBubble } from "./MessageBubble";
import { StatusBanner } from "./StatusBanner";
import { TypingIndicator } from "./TypingIndicator";

type ChatAreaProps = {
  input: string;
  setInput: (value: string) => void;
  messages: ChatMessage[];
  isLoading: boolean;
  validationError: string;
  connectionError: string;
  backendStatus: BackendStatus;
  document: UploadedDocument | null;
  suggestions: string[];
  currentModel: string;
  onSend: () => void;
  onFeedback: (messageId: string, rating: Rating) => void;
  onUploadFile: (file: File) => Promise<void>;
  onDocumentClear: () => void;
  onOpenSource: (context: RetrievedContext) => void;
  onOpenModels: () => void;
  onRefreshSuggestions: () => void;
};

export function ChatArea({
  input,
  setInput,
  messages,
  isLoading,
  validationError,
  connectionError,
  backendStatus,
  document,
  suggestions,
  currentModel,
  onSend,
  onFeedback,
  onUploadFile,
  onDocumentClear,
  onOpenSource,
  onOpenModels,
  onRefreshSuggestions,
}: ChatAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isAssistantStreaming = messages.some(
    (m) => m.role === "assistant" && m.isStreaming,
  );
  const isEmpty = messages.length === 0;
  const modelLabel = currentModel ? currentModel.split(":")[0] : "Auto";

  useEffect(() => {
    if (!isEmpty) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, isEmpty]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  const promptBar = (
    <div className="w-full">
      {document ? (
        <div className="mb-2 flex min-w-0 items-center gap-2 rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">
          <FileText size={16} aria-hidden="true" />
          <span className="truncate">{document.name}</span>
          <span className="ml-auto text-xs opacity-70">attached</span>
        </div>
      ) : null}

      <div className="surface rounded-2xl p-2.5 shadow-lg transition focus-within:border-[color:var(--brand-500)] focus-within:ring-4 focus-within:ring-[color:var(--brand-500)]/15">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          className="max-h-40 min-h-10 w-full resize-none border-0 bg-transparent px-2 py-2 text-[color:var(--text)] outline-none placeholder:text-[color:var(--muted)]"
          placeholder="What do you want to know?"
        />
        <div className="mt-1 flex items-center gap-2">
          {/* Model selector chip */}
          <button
            type="button"
            onClick={onOpenModels}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--text)] transition hover:border-[color:var(--brand-500)]"
            title="Select or download a model"
          >
            <span className="size-2 rounded-full bg-[color:var(--brand-500)]" />
            <span className="max-w-[10rem] truncate">{modelLabel}</span>
            <ChevronDown size={13} />
          </button>

          <div className="relative">
            <DocumentUpload
              document={document}
              onUploadFile={onUploadFile}
              onDocumentClear={onDocumentClear}
            />
          </div>

          <button
            type="button"
            onClick={onSend}
            disabled={isLoading}
            className="ml-auto flex h-10 items-center justify-center gap-2 rounded-xl brand-gradient px-4 font-semibold text-white shadow-lg shadow-[color:var(--brand-600)]/25 transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-[color:var(--brand-500)]/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading && !isAssistantStreaming ? (
              <span className="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Send size={17} aria-hidden="true" />
            )}
            <span className="hidden sm:inline">Send</span>
          </button>
        </div>
      </div>
    </div>
  );

  const suggestionChips =
    suggestions.length > 0 ? (
      <div className="flex flex-wrap items-center justify-center gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setInput(s)}
            className="surface rounded-full px-4 py-2 text-sm text-[color:var(--text)] transition hover:border-[color:var(--brand-500)] hover:text-[color:var(--brand-600)]"
          >
            {s}
          </button>
        ))}
        <button
          type="button"
          onClick={onRefreshSuggestions}
          className="flex size-9 items-center justify-center rounded-full surface text-[color:var(--muted)] transition hover:text-[color:var(--brand-600)]"
          title="New suggestions"
          aria-label="New suggestions"
        >
          <RefreshCw size={15} />
        </button>
      </div>
    ) : null;

  return (
    <main className="flex h-screen min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 md:px-6">
        <div className="flex items-center gap-2">
          <StatusBanner status={backendStatus} error={connectionError} />
        </div>
        <ThemeToggle />
      </header>

      {isEmpty ? (
        /* ---------- Hero (no messages) ---------- */
        <section className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-8">
          <div className="hero-glow mb-6 animate-float-slow">
            <Logo size={72} />
          </div>
          <h1 className="mb-8 text-center text-3xl font-semibold text-[color:var(--text)] md:text-4xl">
            {HERO_HEADLINE}
          </h1>

          <div className="w-full max-w-2xl">
            {validationError ? (
              <p className="mb-2 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
                {validationError}
              </p>
            ) : null}
            {promptBar}
            <div className="mt-5">{suggestionChips}</div>
          </div>
        </section>
      ) : (
        /* ---------- Conversation ---------- */
        <>
          <section className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
            <div className="mx-auto grid max-w-3xl gap-4">
              {validationError ? (
                <div className="animate-fade-in rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
                  {validationError}
                </div>
              ) : null}

              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onFeedback={onFeedback}
                  onOpenSource={onOpenSource}
                />
              ))}

              {isLoading && !isAssistantStreaming ? <TypingIndicator /> : null}
              <div ref={messagesEndRef} />
            </div>
          </section>

          <footer className="shrink-0 px-4 pb-4 md:px-6">
            <div className="mx-auto max-w-3xl">
              {promptBar}
              <p className="mt-2 text-center text-[11px] text-[color:var(--muted)]">
                Answers may be imperfect — verify important details with the relevant UDSM office.
              </p>
            </div>
          </footer>
        </>
      )}
    </main>
  );
}
