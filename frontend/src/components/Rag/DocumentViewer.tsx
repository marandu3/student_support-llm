import { Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fetchDocumentText } from "../../api/client";
import type { RetrievedContext } from "../../types/chat";

type DocumentViewerProps = {
  context: RetrievedContext;
  onClose: () => void;
};

type Segment = { text: string; highlight: boolean };

/** Split the document text into plain + highlighted segments for the cited span. */
function buildSegments(text: string, ctx: RetrievedContext): Segment[] {
  let start = ctx.start ?? -1;
  let end = ctx.end ?? -1;

  // Fall back to locating the chunk text when offsets are missing/invalid.
  if (start < 0 || end <= start || end > text.length) {
    const idx = ctx.text ? text.indexOf(ctx.text.slice(0, 80)) : -1;
    if (idx >= 0) {
      start = idx;
      end = Math.min(text.length, idx + ctx.text.length);
    } else {
      return [{ text, highlight: false }];
    }
  }

  return [
    { text: text.slice(0, start), highlight: false },
    { text: text.slice(start, end), highlight: true },
    { text: text.slice(end), highlight: false },
  ].filter((s) => s.text.length > 0);
}

export function DocumentViewer({ context, onClose }: DocumentViewerProps) {
  const [text, setText] = useState<string | null>(null);
  const [filename, setFilename] = useState(context.source);
  const [error, setError] = useState("");
  const markRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!context.doc_id) {
      setError("This reference came from an inline upload with no stored document.");
      return;
    }
    const controller = new AbortController();
    fetchDocumentText(context.doc_id, controller.signal)
      .then((doc) => {
        setText(doc.text);
        setFilename(doc.filename);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError((err as Error).message);
      });
    return () => controller.abort();
  }, [context.doc_id]);

  // Scroll the highlighted span into view once rendered.
  useEffect(() => {
    if (text && markRef.current) {
      markRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [text]);

  const segments = text ? buildSegments(text, context) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--border)] px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
              Source document
            </p>
            <h3 className="truncate text-base font-bold text-[color:var(--text)]">{filename}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-lg border border-[color:var(--border)] text-[color:var(--muted)] transition hover:text-[color:var(--text)]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="rounded-lg border border-rose-300/50 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
              {error}
            </p>
          ) : !text ? (
            <div className="flex items-center gap-2 text-sm text-[color:var(--muted)]">
              <Loader2 size={16} className="animate-spin" /> Loading document…
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[color:var(--text)]">
              {segments.map((seg, i) =>
                seg.highlight ? (
                  <mark key={i} ref={markRef} className="ref-highlight">
                    {seg.text}
                  </mark>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
