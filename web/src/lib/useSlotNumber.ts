import { useEffect, useRef, useState } from "react";

// Slot-machine number: on change, the display spins through values with
// decreasing speed before locking onto the target — the reel feel.
export function useSlotNumber(target: number, opts: { duration?: number; decimals?: number } = {}): string {
  const { duration = 650, decimals = 0 } = opts;
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    fromRef.current = target;
    const start = performance.now();
    let raf = 0;
    const spin = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      // early phase: jittery reel; late phase: converge
      const jitter = (1 - ease) * Math.abs(target - from) * 0.6 * (Math.random() - 0.5);
      const value = from + (target - from) * ease + jitter;
      setDisplay(t >= 1 ? target : value);
      if (t < 1) raf = requestAnimationFrame(spin);
    };
    raf = requestAnimationFrame(spin);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display.toFixed(decimals);
}
