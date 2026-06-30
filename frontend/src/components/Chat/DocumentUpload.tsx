import { Loader2, Paperclip, X } from "lucide-react";
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import type { UploadedDocument } from "../../types/chat";

type DocumentUploadProps = {
  document: UploadedDocument | null;
  onUploadFile: (file: File) => Promise<void>;
  onDocumentClear: () => void;
};

export function DocumentUpload({
  document,
  onUploadFile,
  onDocumentClear,
}: DocumentUploadProps) {
  const [uploadError, setUploadError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;

    const name = file.name.toLowerCase();
    if (!name.endsWith(".txt") && !name.endsWith(".md")) {
      setUploadError("Only .txt or .md files can be uploaded.");
      return;
    }

    setUploadError("");
    setBusy(true);
    try {
      await onUploadFile(file);
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,text/plain,text/markdown"
        className="hidden"
        onChange={handleChange}
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl border transition focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed ${
          document
            ? "border-emerald-400/60 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300"
            : "border-slate-300 bg-slate-50 text-slate-500 hover:border-blue-400 hover:text-blue-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-300"
        }`}
        aria-label="Upload document"
        title={document ? document.name : "Upload .txt or .md"}
      >
        {busy ? (
          <Loader2 size={19} className="animate-spin" aria-hidden="true" />
        ) : (
          <Paperclip size={19} aria-hidden="true" />
        )}
      </button>

      {uploadError ? (
        <p className="absolute bottom-full left-0 mb-2 w-64 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 shadow-lg dark:bg-red-500/15 dark:text-red-300">
          {uploadError}
        </p>
      ) : null}

      {document ? (
        <button
          type="button"
          onClick={onDocumentClear}
          className="flex size-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/10 dark:bg-white/10 dark:text-slate-300 dark:hover:text-red-400"
          aria-label="Remove document"
          title="Remove document"
        >
          <X size={13} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
