/**
 * Applies the persisted theme before React mounts, avoiding a flash of the
 * wrong theme on load. Runs as an external file (not an inline <script>) so
 * the app's Content-Security-Policy can keep script-src restricted to 'self'
 * with no inline-script exception.
 */
(function () {
  var theme = localStorage.getItem("nicheradar_theme");
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  }
})();
