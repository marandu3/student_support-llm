import { useEffect, useRef } from "react";
import { useChat } from "../hooks/useChat";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import TypingIndicator from "./TypingIndicator";

export default function ChatLayout() {
  const { messages, loading, sendMessage } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div className="flex h-screen bg-slate-950">

      {/* Sidebar */}
      <div className="hidden md:flex w-64 glass border-r border-white/10 p-4 flex-col">
        <button className="mb-4 px-3 py-2 rounded-lg bg-green-500/10 text-green-300 hover:scale-105 transition">
          + New Chat
        </button>

        <div className="text-xs opacity-50">History</div>
      </div>

      {/* Main chat */}
      <div className="flex flex-col flex-1">

        {/* Header */}
        <div className="glass p-4 text-center font-black text-xl neon-text">
          Student AI Assistant
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.map((m) => (
            <ChatMessage key={m.id} msg={m} />
          ))}

          {loading && <TypingIndicator />}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <ChatInput onSend={sendMessage} loading={loading} />
      </div>
    </div>
  );
}