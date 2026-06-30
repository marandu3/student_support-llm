export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: number;
  responseTime?: string;
}