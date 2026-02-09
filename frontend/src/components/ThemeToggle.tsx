import { useTheme } from "../ui/theme";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button className="btn btn-ghost" onClick={toggleTheme} title="Alternar tema">
      {theme === "dark" ? "🌙 Escuro" : "☀️ Claro"}
    </button>
  );
}
