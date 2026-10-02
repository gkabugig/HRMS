// Sets the `dark`/`light` class on <html> before first paint, so there's no
// flash of the wrong theme. Reads a saved choice from localStorage, falling
// back to the OS preference when the person hasn't picked one explicitly.
// Must stay a plain inline script (no module imports) and run in <head>,
// before the page's own styles and content.
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("hrms-theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    var root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(dark ? "dark" : "light");
  } catch (e) {}
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
