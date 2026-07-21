// Haptic feedback (ADR-024 polish): every meaningful gesture gets a physical
// echo. Android/Chrome has navigator.vibrate; iOS Safari doesn't — but on
// iOS 18.0–26.4, clicking the <label> of an <input type="checkbox" switch>
// fires the system haptic. WebKit ignores clicks on the input itself, and
// iOS 26.5 patched programmatic label clicks entirely — for those devices the
// only remaining path is a genuine tap on a real switch (see HapticOverlay).

let labelEl: HTMLLabelElement | null = null;

function iosTick(): void {
  if (!labelEl) {
    labelEl = document.createElement("label");
    labelEl.style.cssText = "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;opacity:0";
    labelEl.setAttribute("aria-hidden", "true");
    const switchEl = document.createElement("input");
    switchEl.type = "checkbox";
    switchEl.setAttribute("switch", "");
    labelEl.appendChild(switchEl);
    document.body.appendChild(labelEl);
  }
  labelEl.click();
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
