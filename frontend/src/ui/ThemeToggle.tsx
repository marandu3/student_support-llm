export default function ThemeToggle() {
  const toggle = () => {
    document.documentElement.classList.toggle("dark");
  };

  return (
    <button
      onClick={toggle}
      className="absolute top-3 right-3 px-3 py-1 border rounded"
    >
      Theme
    </button>
  );
}