import ChatLayout from "./components/ChatLayout";
import ThemeToggle from "./ui/ThemeToggle";
import Header from "./ui/Header";


export default function App() {
  return (
    <div className="relative">
      <ThemeToggle />
      <Header />
      <ChatLayout />
    </div>
  );
}