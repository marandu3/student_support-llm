import { useState } from "react";

export default function ChatInput({
  onSend,
  loading,
}: {
  onSend: (text: string) => void;
  loading: boolean;
}) {
  const [text, setText] = useState("");

  const send = () => {
    onSend(text);
    setText("");
  };

  return (
    <div className="p-3 border-t border-white/10 flex gap-2 glass">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()}
        placeholder="Ask your question..."
        className="
          flex-1 px-4 py-2 rounded-xl
          bg-slate-900/60 border border-white/10
          focus:border-green-400 focus:shadow-[0_0_25px_rgba(16,185,129,0.4)]
          outline-none transition
        "
      />

      <button
        onClick={send}
        disabled={loading}
        className="
          px-5 py-2 rounded-xl
          bg-gradient-to-r from-green-400 to-emerald-500
          text-black font-semibold
          hover:scale-105 transition
          neon-glow
        "
      >
        Send
      </button>
    </div>
  );
}