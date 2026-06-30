import capIcon from "../assets/gradcap.png";
import udsmlogo from "../assets/udsmlogo.png";

export default function Header() {
  return (
    <header className="w-full border-b dark:border-gray-700 bg-white dark:bg-black shadow-sm">
      <div className="flex items-center justify-center gap-4 py-4 px-4">

        {/* Left icon */}
        <img
          src={capIcon}
          alt="Graduation Cap"
          className="w-10 h-10 object-contain"
        />

        {/* Title block */}
        <div className="text-center leading-tight">
          <h1 className="text-2xl md:text-3xl font-bold tracking-wide">
            Student Support Assistant
          </h1>

          <p className="text-sm opacity-70">
            University of Dar es Salaam Intelligent Help System
          </p>
        </div>

        {/* Right logo */}
        <img
          src={udsmlogo}
          alt="UDSM Logo"
          className="w-10 h-10 object-contain"
        />
      </div>
    </header>
  );
}