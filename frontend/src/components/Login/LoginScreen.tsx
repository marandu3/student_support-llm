import {
  AlertCircle,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Shield,
  Sparkles,
  User,
  UserPlus,
} from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { login, register } from "../../api/client";
import type { AuthUser } from "../../types/chat";
import { Logo } from "../Logo";
import { ThemeToggle } from "../ThemeToggle";

const DEMO_USERNAME = "demo";
const DEMO_PASSWORD = "demo12345";

type LoginScreenProps = {
  onAuthenticated: (user: AuthUser) => void;
};

type Mode = "login" | "register";

const FEATURES = [
  "Grounded answers from official UDSM documents (RAG)",
  "Real-time streaming responses",
  "Upload your own policy documents",
  "Secure, private student account",
];

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!username.trim() || !password.trim()) {
      setError("Enter both a username and password to continue.");
      return;
    }
    if (isRegister && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const result = isRegister
        ? await register({
            username: username.trim(),
            password,
            display_name: displayName.trim(),
            email: email.trim(),
          })
        : await login({ username: username.trim(), password });
      onAuthenticated(result.user);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Authentication failed.";
      // Friendlier hint when the backend is unreachable.
      setError(
        /failed to fetch|networkerror|load failed/i.test(message)
          ? "Cannot reach the server. Start the backend, or continue in demo mode below."
          : message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
  }

  async function continueAsDemo() {
    setError("");
    setSubmitting(true);
    try {
      const result = await login({
        username: DEMO_USERNAME,
        password: DEMO_PASSWORD,
      });
      onAuthenticated(result.user);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Demo sign-in failed.";
      setError(
        /failed to fetch|networkerror|load failed/i.test(message)
          ? "Cannot reach the server. Start the backend (or run docker compose up)."
          : message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Ambient aurora background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-24 size-[28rem] rounded-full bg-blue-600/30 blur-[120px] animate-aurora" />
        <div className="absolute -bottom-32 right-0 size-[26rem] rounded-full bg-cyan-500/20 blur-[120px] animate-aurora [animation-delay:1.5s]" />
        <div className="absolute left-1/3 top-1/2 size-[20rem] rounded-full bg-indigo-700/20 blur-[120px] animate-aurora [animation-delay:3s]" />
      </div>

      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>

      <section className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/15 bg-white/70 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-white/5 md:grid-cols-2">
        {/* Brand panel */}
        <aside className="relative hidden flex-col justify-between gap-8 bg-gradient-to-br from-blue-900 via-blue-700 to-blue-950 p-10 text-white md:flex">
          <div className="absolute inset-0 opacity-20 [background:radial-gradient(circle_at_20%_20%,white,transparent_40%)]" />
          <div className="relative">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-white/90 ring-1 ring-white/30 backdrop-blur animate-float-slow">
                <Logo size={32} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                  University of Dar es Salaam
                </p>
                <h1 className="text-2xl font-bold leading-tight">
                  Student Support Assistant
                </h1>
              </div>
            </div>
            <p className="max-w-sm text-sm leading-6 text-blue-100/90">
              Your AI-powered guide to registration, examinations, fees and
              campus life — grounded in official university documents.
            </p>
          </div>

          <ul className="relative space-y-3">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-cyan-400/20 text-cyan-200">
                  <Sparkles size={12} aria-hidden="true" />
                </span>
                <span className="text-blue-50/90">{feature}</span>
              </li>
            ))}
          </ul>

          <div className="relative flex items-center gap-2 text-xs text-blue-200/80">
            <Shield size={14} aria-hidden="true" />
            Passwords are hashed and never stored in plain text.
          </div>
        </aside>

        {/* Form panel */}
        <div className="p-8 md:p-10">
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <Logo size={40} className="rounded-xl" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              UDSM Student Assistant
            </h1>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isRegister ? "Create your account" : "Welcome back"}
          </h2>
          <p className="mb-6 mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isRegister
              ? "Register to start chatting with the assistant."
              : "Sign in to continue to your assistant."}
          </p>

          {/* Mode tabs */}
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-white/5">
            {(["login", "register"] as Mode[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => switchMode(value)}
                className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${
                  mode === value
                    ? "bg-white text-blue-700 shadow-sm dark:bg-blue-600 dark:text-white"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {value === "login" ? (
                  <>
                    <LogIn size={15} /> Sign In
                  </>
                ) : (
                  <>
                    <UserPlus size={15} /> Register
                  </>
                )}
              </button>
            ))}
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <Field
              icon={<User size={16} />}
              label="Username"
              value={username}
              onChange={setUsername}
              placeholder="e.g. john.makinda"
              autoComplete="username"
            />

            {isRegister ? (
              <>
                <Field
                  icon={<Sparkles size={16} />}
                  label="Display name (optional)"
                  value={displayName}
                  onChange={setDisplayName}
                  placeholder="Full name"
                  autoComplete="name"
                />
                <Field
                  icon={<Mail size={16} />}
                  label="Email (optional)"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@udsm.ac.tz"
                  type="email"
                  autoComplete="email"
                />
              </>
            ) : null}

            <Field
              icon={<Lock size={16} />}
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder={isRegister ? "At least 6 characters" : "Enter password"}
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
            />

            {error ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-300/60 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl brand-gradient font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? (
                <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              ) : isRegister ? (
                <UserPlus size={18} aria-hidden="true" />
              ) : (
                <LogIn size={18} aria-hidden="true" />
              )}
              {submitting
                ? "Please wait…"
                : isRegister
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-300/60 dark:bg-white/10" />
            or
            <span className="h-px flex-1 bg-slate-300/60 dark:bg-white/10" />
          </div>

          <button
            type="button"
            onClick={continueAsDemo}
            disabled={submitting}
            className="mt-4 w-full rounded-xl border border-slate-300 bg-white/60 py-2.5 text-sm font-medium text-slate-600 transition hover:border-blue-400 hover:text-blue-700 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-cyan-400/50 dark:hover:text-cyan-300"
          >
            Continue with demo account
          </button>
          <p className="mt-2 text-center text-xs text-slate-400">
            Demo: <code>demo</code> / <code>demo12345</code> · Admin:{" "}
            <code>admin</code> / <code>admin12345</code>
          </p>
        </div>
      </section>
    </main>
  );
}

type FieldProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
};

function Field({
  icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
}: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </span>
      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/15 dark:border-white/10 dark:bg-white/5 dark:focus-within:border-cyan-400/60 dark:focus-within:ring-cyan-400/10">
        <span className="text-slate-400 dark:text-slate-500">{icon}</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full bg-transparent text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
          placeholder={placeholder}
          type={type}
          autoComplete={autoComplete}
        />
      </div>
    </label>
  );
}
