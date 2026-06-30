import type { Message } from "../types/chat";

export default function ChatMessage({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`
          max-w-[75%] px-4 py-3 rounded-2xl text-sm
          transition-all duration-300
          glass
          ${isUser ? "border-green-400/30 text-green-300 neon-glow" : ""}
        `}
      >
        <p className="leading-relaxed">{msg.content}</p>

        {msg.responseTime && (
          <span className="text-[10px] opacity-60 block mt-1">
            {msg.responseTime}s
          </span>
        )}
      </div>
    </div>
  );
}