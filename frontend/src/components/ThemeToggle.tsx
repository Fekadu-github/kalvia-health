import { useTheme } from "../theme";
import Icon from "./Icon";

/** Light/dark switch: "full" (labelled, for the sidebar) or "icon" (round, for bars). */
export default function ThemeToggle({ variant = "icon" }: { variant?: "full" | "icon" }) {
  const { theme, toggle } = useTheme();
  const toLight = theme === "dark";
  const label = toLight ? "Light mode" : "Dark mode";
  return (
    <button
      type="button"
      onClick={toggle}
      className={variant === "icon" ? "theme-btn icon" : "theme-btn"}
      aria-label={`Switch to ${label.toLowerCase()}`}
      title={label}
    >
      <Icon name={toLight ? "sun" : "moon"} size={18} />
      {variant === "full" && <span>{label}</span>}
    </button>
  );
}
