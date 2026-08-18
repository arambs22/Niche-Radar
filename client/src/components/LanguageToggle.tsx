import { useLanguage } from "../context/LanguageContext";

/** Simple globe icon (rather than <img src=...>) so `currentColor` picks up the theme palette via Tailwind text classes. */
function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <ellipse cx="12" cy="12" rx="4" ry="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 12h18M4.5 7.5h15M4.5 16.5h15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

interface LanguageToggleProps {
  className?: string;
}

/** Globe button that flips the UI language; hovering (or focusing) pops a small label below it naming the active language. */
export function LanguageToggle({ className = "" }: LanguageToggleProps) {
  const { language, t, toggleLanguage } = useLanguage();
  const label = language === "es" ? "Español" : "English";

  return (
    <div className={`group relative ${className}`}>
      <button
        type="button"
        onClick={toggleLanguage}
        aria-label={t.nav.changeLanguage}
        className="flex items-center justify-center rounded p-1.5 text-text-muted hover:bg-bg hover:text-primary"
      >
        <GlobeIcon />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded border border-border bg-surface px-2 py-1 text-xs text-text opacity-0 shadow-lg transition-all duration-150 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}
