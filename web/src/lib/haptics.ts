// Haptic feedback (ADR-024 polish): every meaningful gesture gets a physical
// echo. Android/Chrome has navigator.vibrate; iOS Safari doesn't — but since
// iOS 17.4 a toggled <input type="checkbox" switch> fires the system haptic,
// so we keep one hidden switch and click it.

let switchEl: HTMLInputElement | null = null;

function iosTick(): void {
  if (!switchEl) {
    const label = document.createElement("label");
    label.style.cssText = "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0";
    label.setAttribute("aria-hidden", "true");
    switchEl = document.createElement("input");
    switchEl.type = "checkbox";
    switchEl.setAttribute("switch", "");
    label.appendChild(switchEl);
    document.body.appendChild(label);
  }
  switchEl.click();
}

export type HapticKind = "light" | "medium" | "success";

export function haptic(kind: HapticKind = "light"): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator && navigator.vibrate) {
      navigator.vibrate(kind === "light" ? 8 : kind === "medium" ? 16 : [12, 60, 20]);
      return;
    }
    iosTick();
    if (kind === "success") setTimeout(iosTick, 110);
  } catch {
    /* no haptics on this device — silence is fine */
  }
}
