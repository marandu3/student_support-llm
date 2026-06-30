export default function TypingIndicator() {
  return (
    <div className="flex gap-1 p-3">
      <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce"></span>
      <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
      <span className="w-2 h-2 bg-green-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
    </div>
  );
}