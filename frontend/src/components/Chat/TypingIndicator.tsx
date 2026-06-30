import { Sparkles } from "lucide-react";

export function TypingIndicator() {
  return (
    <div className="flex animate-fade-in justify-start">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg brand-gradient text-white shadow-sm">
          <Sparkles size={16} aria-hidden="true" />
        </div>
        <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/[0.06]">
          <div className="flex items-center gap-1.5">
            <span className="size-2 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.3s]" />
            <span className="size-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:-0.15s]" />
            <span className="size-2 animate-bounce rounded-full bg-indigo-400" />
            <span className="ml-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              Thinking…
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
