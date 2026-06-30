import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import type { BackendStatus } from "../../types/chat";

type StatusBannerProps = {
  status: BackendStatus;
  error: string;
};

export function StatusBanner({ status }: StatusBannerProps) {
  const isOnline = status === "online";
  const isChecking = status === "checking";

  const label = isOnline ? "Online" : isChecking ? "Connecting" : "Demo mode";

  return (
    <div
      title={isOnline ? "Backend connected" : isChecking ? "Checking backend" : "Backend unavailable — sample responses"}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
        isOnline
          ? "border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300"
          : isChecking
            ? "border-amber-300/60 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300"
            : "border-red-300/60 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300"
      }`}
    >
      {isOnline ? (
        <CircleCheck size={14} aria-hidden="true" />
      ) : isChecking ? (
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
      ) : (
        <CircleAlert size={14} aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}
