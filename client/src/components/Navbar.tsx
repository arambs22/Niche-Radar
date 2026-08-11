import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

/** Top bar for authenticated pages: wordmark with a radar-pulse signature, theme toggle, logged-in email, and logout. */
export function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
      <span className="flex items-center gap-2 font-display text-lg font-semibold text-text">
        <span className="relative flex h-2.5 w-2.5">
          <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
        NicheRadar
      </span>
      <div className="flex items-center gap-4 text-sm text-text-muted">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "light" ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
          className="rounded border border-border px-2 py-1 hover:bg-bg"
        >
          {theme === "light" ? "·:·" : "·:·"}
        </button>
        <span>{user?.email}</span>
        <button
          type="button"
          onClick={() => logout()}
          className="rounded border border-border px-3 py-1 hover:bg-bg"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
