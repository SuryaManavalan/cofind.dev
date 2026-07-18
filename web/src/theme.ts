// Theme manager (ADR-018): data-theme picks the palette, data-mode is the
// resolved light/dark. Sandboxed post frames re-render on "cofind:theme".

export interface ThemeDef {
  id: string;
  label: string;
  // [dark surface, accent] — used for the picker swatches
  swatch: [string, string];
}

export const THEMES: ThemeDef[] = [
  { id: "night-winter", label: "Night Winter", swatch: ["#141c33", "#8bafd0"] },
  { id: "zinc", label: "Zinc", swatch: ["#18181b", "#a78bfa"] },
  { id: "ember", label: "Ember", swatch: ["#171310", "#fbbf24"] },
  { id: "forest", label: "Forest", swatch: ["#0f1712", "#34d399"] },
];

export type Mode = "system" | "light" | "dark";
export const MODES: Mode[] = ["system", "light", "dark"];

const mq = window.matchMedia("(prefers-color-scheme: dark)");

export function getTheme(): string {
  return localStorage.getItem("cofind-theme") ?? "night-winter";
}

export function getMode(): Mode {
  return (localStorage.getItem("cofind-mode") as Mode) ?? "system";
}

export function applyTheme(): void {
  const mode = getMode();
  const resolved = mode === "system" ? (mq.matches ? "dark" : "light") : mode;
  const root = document.documentElement;
  root.dataset.theme = getTheme();
  root.dataset.mode = resolved;
  window.dispatchEvent(new CustomEvent("cofind:theme"));
}

export function setTheme(id: string): void {
  localStorage.setItem("cofind-theme", id);
  applyTheme();
}

export function setMode(mode: Mode): void {
  localStorage.setItem("cofind-mode", mode);
  applyTheme();
}

mq.addEventListener("change", () => {
  if (getMode() === "system") applyTheme();
});
