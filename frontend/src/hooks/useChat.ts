import { useState } from "react";
import type { Message } from "../types/chat";
import { askQuestion } from "../api/client";

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      time: Date.now(),
    };

    setMessages((p) => [...p, userMsg]);
    setLoading(true);

    try {
      const res = await askQuestion(text);

      const botMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: res.answer,
        time: Date.now(),
        responseTime: res.time,
      };

      setMessages((p) => [...p, botMsg]);
    } catch {
      setMessages((p) => [
        ...p,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "System error: backend unreachable",
          time: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return { messages, loading, sendMessage };
}