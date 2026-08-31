import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import TonoClaro from "../assets/Tono_Claro.png";
import TonoOscuro from "../assets/Tono_Oscuro.png";
import On from "../assets/On.svg";
import Off from "../assets/Off.svg";

/** Light/dark mode switch: a sun/moon icon plus an on/off toggle. Shared by Navbar and the public auth pages. */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();

  return (
    <span className="flex items-center">
      <img src={theme === "light" ? TonoClaro : TonoOscuro} alt="" className="h-19 w-14" />
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === "light" ? t.nav.toDarkMode : t.nav.toLightMode}
      >
        <img src={theme === "light" ? On : Off} alt="" className="h-12 w-12" />
      </button>
    </span>
  );
}
