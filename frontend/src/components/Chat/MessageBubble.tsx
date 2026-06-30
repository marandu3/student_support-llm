import {
  AlertTriangle,
  Check,
  Clock,
  FileText,
  Gauge,
  Minus,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import type { ComponentType } from "react";
import type { ChatMessage, Rating, RetrievedContext } from "../../types/chat";
import { Logo } from "../Logo";

type MessageBubbleProps = {
  message: ChatMessage;
  onFeedback: (messageId: string, rating: Rating) => void;
  onOpenSource: (context: RetrievedContext) => void;
};

const RATING_BUTTONS: {
  rating: Rating;
  Icon: ComponentType<{ size?: number }>;
  label: string;
  activeClass: string;
}[] = [
  { rating: "Good", Icon: ThumbsUp, label: "Good", activeClass: "border-emerald-500 bg-emerald-500 text-white" },
  { rating: "Average", Icon: Minus, label: "Average", activeClass: "border-amber-500 bg-amber-500 text-white" },
  { rating: "Poor", Icon: ThumbsDown, label: "Poor", activeClass: "border-rose-500 bg-rose-500 text-white" },
];

export function MessageBubble({ message, onFeedback, onOpenSource }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const contexts = message.contexts ?? [];
  const hasContext = contexts.length > 0;

  return (
    <article className={`flex animate-pop-in ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[88%] gap-2.5 md:max-w-[80%] ${isUser ? "flex-row-reverse" : ""}`}>
        {/* Avatar */}
        {isUser ? (
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-white dark:bg-slate-600">
            <span className="text-xs font-bold">You</span>
          </div>
        ) : (
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg surface">
            <Logo size={20} />
          </div>
        )}

        <div className="min-w-0">
          <div
            className={`min-w-0 overflow-hidden rounded-2xl px-4 py-3 shadow-sm ${
              isUser
                ? "rounded-tr-sm brand-gradient text-white"
                : message.isError
                  ? "rounded-tl-sm border border-rose-300/60 bg-rose-50 text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200"
                  : "rounded-tl-sm surface text-slate-800 dark:text-slate-100"
            }`}
          >
            {message.isError ? (
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
                <AlertTriangle size={12} /> Error
              </div>
            ) : null}
            <p className="whitespace-pre-wrap break-words text-sm leading-6">
              {message.content}
              {message.isStreaming ? (
                <span className="ml-0.5 inline-block h-4 w-[3px] animate-caret rounded-full bg-current align-middle" />
              ) : null}
            </p>
          </div>

          {/* Meta line (assistant only) */}
          {!isUser && !message.isStreaming && !message.isError ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-[color:var(--muted)]">
              {message.source ? (
                <span className="inline-flex items-center gap-1 font-medium">{message.source}</span>
              ) : null}
              {typeof message.responseTime === "number" ? (
                <span className="inline-flex items-center gap-1">
                  <Clock size={11} /> {message.responseTime.toFixed(2)}s
                </span>
              ) : null}
              {typeof message.tokensPerSecond === "number" ? (
                <span className="inline-flex items-center gap-1">
                  <Gauge size={11} /> {message.tokensPerSecond.toFixed(1)} tok/s
                </span>
              ) : null}
              {message.model ? (
                <span className="opacity-70">{message.model}</span>
              ) : null}
            </div>
          ) : null}

          {/* Source chips — click to open the document and highlight the span */}
          {!isUser && hasContext ? (
            <div className="mt-2 flex flex-wrap gap-1.5 px-1">
              {contexts.map((ctx, index) => (
                <button
                  key={`${ctx.doc_id ?? "inline"}-${index}`}
                  type="button"
                  onClick={() => onOpenSource(ctx)}
                  disabled={!ctx.doc_id}
                  title={ctx.doc_id ? `Open ${ctx.source}` : "Inline upload (no source document)"}
                  className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-translucent)] px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-[color:var(--brand-500)] hover:text-[color:var(--brand-600)] disabled:cursor-default disabled:opacity-60 dark:text-slate-300"
                >
                  <FileText size={12} />
                  <span className="truncate">{ctx.source}</span>
                </button>
              ))}
            </div>
          ) : null}

          {/* Feedback (thumbs) */}
          {!isUser && !message.isStreaming && !message.isError ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
              <span className="mr-1 text-[11px] font-medium text-[color:var(--muted)]">Helpful?</span>
              {RATING_BUTTONS.map(({ rating, Icon, label, activeClass }) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => onFeedback(message.id, rating)}
                  disabled={message.feedbackStatus === "sending"}
                  title={label}
                  aria-label={label}
                  className={`flex size-7 items-center justify-center rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-500)]/30 disabled:cursor-not-allowed disabled:opacity-60 ${
                    message.feedback === rating
                      ? activeClass
                      : "border-[color:var(--border)] bg-[color:var(--surface-translucent)] text-slate-500 hover:border-[color:var(--brand-500)] hover:text-[color:var(--brand-600)] dark:text-slate-300"
                  }`}
                >
                  <Icon size={14} />
                </button>
              ))}
              {message.feedbackStatus === "sent" ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <Check size={12} /> Thanks!
                </span>
              ) : null}
              {message.feedbackStatus === "error" ? (
                <span className="text-[11px] font-medium text-rose-500">Failed to send</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
