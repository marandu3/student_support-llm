import {
  Cpu,
  Database,
  LogOut,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type {
  AuthUser,
  BackendStatus,
  SessionSummary,
} from "../../types/chat";
import { Logo } from "../Logo";
import { formatHistoryTime } from "../../utils/messages";

type LeftSidebarProps = {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  user: AuthUser;
  currentModel: string;
  backendStatus: BackendStatus;
  onNewChat: () => void;
  onSelectChat: (sessionId: string) => void;
  onDeleteChat: (sessionId: string) => void;
  onOpenModels: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
};

export function LeftSidebar({
  sessions,
  activeSessionId,
  user,
  currentModel,
  backendStatus,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onOpenModels,
  onOpenAdmin,
  onLogout,
}: LeftSidebarProps) {
  const initials = (user.display_name || user.username || "U").slice(0, 2).toUpperCase();
  const modelLabel = currentModel ? currentModel.split(":")[0] : "—";
  const isAdmin = user.role === "admin";

  return (
    <aside className="fixed left-0 top-0 z-20 hidden h-screen w-[19rem] shrink-0 flex-col overflow-x-hidden border-r border-[color:var(--border)] glass lg:flex">
      {/* Header */}
      <div className="border-b border-[color:var(--border)] p-5">
        <div className="mb-5 flex items-center gap-3">
          <Logo size={40} className="rounded-lg" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--brand-600)]">
              UDSM
            </p>
            <h2 className="truncate text-base font-bold leading-tight text-[color:var(--text)]">
              Student Assistant
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={onNewChat}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl brand-gradient text-sm font-semibold text-white shadow-lg shadow-[color:var(--brand-600)]/25 transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-[color:var(--brand-500)]/30"
        >
          <Plus size={17} aria-hidden="true" />
          New Chat
        </button>
      </div>

      {/* Chat history */}
      <section className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
        <h3 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
          History
        </h3>

        {sessions.length === 0 ? (
          <p className="px-1 text-xs text-[color:var(--muted)]">
            No conversations yet. Start a new chat.
          </p>
        ) : (
          <div className="grid gap-1.5">
            {sessions.map((session) => {
              const isActive = session.session_id === activeSessionId;
              return (
                <div
                  key={session.session_id}
                  className={`group flex min-w-0 items-center gap-2 overflow-hidden rounded-xl border px-2.5 py-2 transition ${
                    isActive
                      ? "border-[color:var(--brand-500)] bg-[color:var(--brand-500)]/10"
                      : "border-transparent hover:border-[color:var(--border)] hover:bg-[color:var(--surface-translucent)]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectChat(session.session_id)}
                    className="min-w-0 flex-1 overflow-hidden text-left focus:outline-none"
                  >
                    <div className="flex min-w-0 items-center gap-2 text-[11px] text-[color:var(--muted)]">
                      <MessageSquareText size={12} aria-hidden="true" />
                      <span className="shrink-0">{formatHistoryTime(session.updated_at)}</span>
                    </div>
                    <p className="truncate text-sm font-medium text-[color:var(--text)]">
                      {session.title}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteChat(session.session_id)}
                    className="rounded-lg p-1 text-[color:var(--muted)] opacity-0 transition hover:bg-rose-500/10 hover:text-rose-500 focus:opacity-100 group-hover:opacity-100"
                    aria-label="Delete chat"
                    title="Delete chat"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Tools */}
      <div className="grid gap-1 border-t border-[color:var(--border)] p-3">
        <button
          type="button"
          onClick={onOpenModels}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[color:var(--text)] transition hover:bg-[color:var(--surface-translucent)]"
        >
          <Cpu size={16} className="text-[color:var(--brand-600)]" />
          <span className="flex-1 text-left">Model</span>
          <span className="max-w-[7rem] truncate text-xs text-[color:var(--muted)]">{modelLabel}</span>
        </button>
        {isAdmin ? (
          <button
            type="button"
            onClick={onOpenAdmin}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[color:var(--text)] transition hover:bg-[color:var(--surface-translucent)]"
          >
            <Database size={16} className="text-[color:var(--brand-600)]" />
            <span className="flex-1 text-left">Knowledge base</span>
            <ShieldCheck size={14} className="text-emerald-500" />
          </button>
        ) : null}
      </div>

      {/* User footer */}
      <div className="flex items-center gap-3 border-t border-[color:var(--border)] p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full brand-gradient text-sm font-bold text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[color:var(--text)]">
            {user.display_name || user.username}
            {isAdmin ? (
              <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-600">
                admin
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-[color:var(--muted)]">
            {user.username === "guest" ? "Demo session" : `@${user.username}`}
            <span
              className={`ml-2 ${
                backendStatus === "online"
                  ? "text-emerald-500"
                  : backendStatus === "checking"
                    ? "text-amber-500"
                    : "text-rose-500"
              }`}
            >
              ● {backendStatus}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex size-9 items-center justify-center rounded-lg border border-[color:var(--border)] text-[color:var(--muted)] transition hover:border-rose-400/40 hover:text-rose-500"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
