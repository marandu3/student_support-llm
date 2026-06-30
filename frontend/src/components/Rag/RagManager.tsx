import {
  Database,
  FileText,
  Loader2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  deleteRagDocument,
  listRagDocuments,
  uploadRagDocument,
} from "../../api/client";
import type { RagDocument } from "../../types/chat";

type RagManagerProps = {
  onClose: () => void;
  onChanged?: (ragReady: boolean) => void;
};

function formatBytes(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}

export function RagManager({ onClose, onChanged }: RagManagerProps) {
  const [docs, setDocs] = useState<RagDocument[]>([]);
  const [ragReady, setRagReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listRagDocuments(controller.signal)
      .then((d) => {
        setDocs(d.documents);
        setRagReady(d.rag_ready);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError((err as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  function apply(d: { documents: RagDocument[]; rag_ready: boolean }) {
    setDocs(d.documents);
    setRagReady(d.rag_ready);
    onChanged?.(d.rag_ready);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      let latest;
      for (const file of Array.from(files)) {
        latest = await uploadRagDocument(file);
      }
      if (latest) apply(latest);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(docId: string) {
    setBusyId(docId);
    setError("");
    try {
      apply(await deleteRagDocument(docId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[color:var(--border)] px-5 py-3.5">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-[color:var(--text)]">
              <Database size={18} /> Knowledge base
            </h3>
            <p className="text-xs text-[color:var(--muted)]">
              Admin · documents used for retrieval ({ragReady ? "active" : "empty"})
            </p>
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
            <p className="mb-3 rounded-lg border border-rose-300/50 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
              {error}
            </p>
          ) : null}

          {/* Upload dropzone */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="mb-4 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[color:var(--border)] px-4 py-7 text-center transition hover:border-[color:var(--brand-500)] disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 size={22} className="animate-spin text-[color:var(--brand-600)]" />
            ) : (
              <Upload size={22} className="text-[color:var(--brand-600)]" />
            )}
            <span className="text-sm font-semibold text-[color:var(--text)]">
              {uploading ? "Uploading & indexing…" : "Upload documents"}
            </span>
            <span className="text-xs text-[color:var(--muted)]">
              .txt, .md, .pdf, .docx · rebuilds the index automatically
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.pdf,.docx"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-[color:var(--muted)]">
              <Loader2 size={16} className="animate-spin" /> Loading documents…
            </div>
          ) : docs.length === 0 ? (
            <p className="py-4 text-center text-sm text-[color:var(--muted)]">
              No documents yet. Upload your UDSM policies, prospectus or almanac to
              ground answers.
            </p>
          ) : (
            <ul className="grid gap-2">
              {docs.map((doc) => (
                <li
                  key={doc.doc_id}
                  className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] px-3 py-2.5"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--brand-500)]/12 text-[color:var(--brand-600)]">
                    <FileText size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[color:var(--text)]">
                      {doc.filename}
                    </span>
                    <span className="block text-xs text-[color:var(--muted)]">
                      {doc.chunks} chunks · {formatBytes(doc.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(doc.doc_id)}
                    disabled={busyId === doc.doc_id}
                    className="flex size-8 items-center justify-center rounded-lg border border-[color:var(--border)] text-[color:var(--muted)] transition hover:border-rose-400 hover:text-rose-500 disabled:opacity-60"
                    aria-label={`Delete ${doc.filename}`}
                  >
                    {busyId === doc.doc_id ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Trash2 size={15} />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
