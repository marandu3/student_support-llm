import { Check, Cpu, Download, Loader2, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { listModels, pullModel, selectModel } from "../../api/client";
import type { OllamaModel, PullProgress } from "../../types/chat";

type ModelManagerProps = {
  onClose: () => void;
  onModelChanged: (model: string) => void;
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

export function ModelManager({ onClose, onModelChanged }: ModelManagerProps) {
  const [current, setCurrent] = useState("");
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [pullName, setPullName] = useState("");
  const [pulling, setPulling] = useState(false);
  const [progress, setProgress] = useState<PullProgress | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const data = await listModels(signal);
      setCurrent(data.current);
      setModels(data.available);
      setError("");
    } catch (err) {
      if (!signal?.aborted) setError((err as Error).message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  async function handleSelect(name: string) {
    setBusy(name);
    setError("");
    try {
      const active = await selectModel(name);
      setCurrent(active);
      onModelChanged(active);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handlePull() {
    const name = pullName.trim();
    if (!name || pulling) return;
    setPulling(true);
    setProgress({ status: "starting" });
    setError("");
    try {
      await pullModel(name, (p) => setProgress(p));
      setPullName("");
      setProgress({ status: "complete", done: true });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
      setProgress(null);
    } finally {
      setPulling(false);
    }
  }

  const pct =
    progress?.completed && progress?.total
      ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[color:var(--border)] px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-base font-bold text-[color:var(--text)]">
            <Cpu size={18} /> Models
          </h3>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void refresh()}
              className="flex size-9 items-center justify-center rounded-lg border border-[color:var(--border)] text-[color:var(--muted)] transition hover:text-[color:var(--text)]"
              aria-label="Refresh"
            >
              <RefreshCw size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex size-9 items-center justify-center rounded-lg border border-[color:var(--border)] text-[color:var(--muted)] transition hover:text-[color:var(--text)]"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="mb-3 rounded-lg border border-rose-300/50 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
              {error}
            </p>
          ) : null}

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
            Installed
          </p>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-[color:var(--muted)]">
              <Loader2 size={16} className="animate-spin" /> Loading models…
            </div>
          ) : models.length === 0 ? (
            <p className="py-4 text-sm text-[color:var(--muted)]">
              No models installed. Pull one below (e.g. <code>phi3</code>).
            </p>
          ) : (
            <ul className="grid gap-2">
              {models.map((m) => {
                const active = m.name === current;
                return (
                  <li key={m.name}>
                    <button
                      type="button"
                      onClick={() => handleSelect(m.name)}
                      disabled={active || busy === m.name}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                        active
                          ? "border-[color:var(--brand-500)] bg-[color:var(--brand-500)]/10"
                          : "border-[color:var(--border)] hover:border-[color:var(--brand-500)]"
                      }`}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg brand-gradient text-white">
                        <Cpu size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[color:var(--text)]">
                          {m.name}
                        </span>
                        <span className="block text-xs text-[color:var(--muted)]">
                          {[m.parameter_size, formatSize(m.size)].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {active ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--brand-600)]">
                          <Check size={14} /> Active
                        </span>
                      ) : busy === m.name ? (
                        <Loader2 size={15} className="animate-spin text-[color:var(--muted)]" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Pull a new model */}
          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
            Download a model
          </p>
          <div className="flex gap-2">
            <input
              value={pullName}
              onChange={(e) => setPullName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePull()}
              placeholder="e.g. llama3.2, phi3, mistral"
              disabled={pulling}
              className="min-w-0 flex-1 rounded-xl border border-[color:var(--border)] bg-transparent px-3 py-2.5 text-sm text-[color:var(--text)] outline-none placeholder:text-[color:var(--muted)] focus:border-[color:var(--brand-500)]"
            />
            <button
              type="button"
              onClick={handlePull}
              disabled={pulling || !pullName.trim()}
              className="flex shrink-0 items-center gap-2 rounded-xl brand-gradient px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {pulling ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Pull
            </button>
          </div>

          {progress ? (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs text-[color:var(--muted)]">
                <span className="truncate">{progress.status}</span>
                {pct !== null ? <span>{pct}%</span> : null}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[color:var(--border)]">
                <div
                  className="h-full brand-gradient transition-all"
                  style={{ width: pct !== null ? `${pct}%` : pulling ? "40%" : "100%" }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
