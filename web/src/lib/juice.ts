// The juice engine (ADR-023): one consistent celebration system.
// Theme-colored particles on a transient full-screen canvas — fireworks for
// jackpots (ships, settlements), bursts for micro-wins (reactions, trades).

function themeColors(): string[] {
  const cs = getComputedStyle(document.documentElement);
  const brand = cs.getPropertyValue("--brand").trim() || "#8bafd0";
  const fg = cs.getPropertyValue("--foreground").trim() || "#ffffff";
  const success = cs.getPropertyValue("--success").trim() || "#34d399";
  const warning = cs.getPropertyValue("--warning").trim() || "#fbbf24";
  return [brand, success, fg, brand, warning];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  size: number;
  color: string;
  gravity: number;
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let raf = 0;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999";
  document.body.appendChild(canvas);
  ctx = canvas.getContext("2d");
  const resize = () => {
    if (!canvas) return;
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
    ctx?.scale(devicePixelRatio, devicePixelRatio);
  };
  resize();
  addEventListener("resize", resize);
}

function loop() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter((p) => p.life < p.ttl);
  if (particles.length === 0) {
    cancelAnimationFrame(raf);
    raf = 0;
    canvas.remove();
    canvas = null;
    ctx = null;
    return;
  }
  for (const p of particles) {
    p.life++;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;
    p.vx *= 0.985;
    const alpha = 1 - p.life / p.ttl;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.5 + alpha * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  raf = requestAnimationFrame(loop);
}

function spawn(list: Particle[]) {
  ensureCanvas();
  particles.push(...list);
  if (!raf) raf = requestAnimationFrame(loop);
}

// micro-win: a small burst at a point (reaction taps, trade fills)
export function burst(x: number, y: number, count = 14) {
  const colors = themeColors();
  spawn(
    Array.from({ length: count }, () => {
      const a = Math.random() * Math.PI * 2;
      const v = 1.5 + Math.random() * 3.5;
      return {
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 1,
        life: 0,
        ttl: 34 + Math.random() * 22,
        size: 1.5 + Math.random() * 2.5,
        color: colors[Math.floor(Math.random() * colors.length)]!,
        gravity: 0.06,
      };
    }),
  );
}

// the jackpot: staged fireworks across the screen (ships, settlements)
export function fireworks(intensity = 1) {
  const colors = themeColors();
  const shells = Math.round(6 * intensity);
  for (let i = 0; i < shells; i++) {
    setTimeout(() => {
      const cx = innerWidth * (0.15 + Math.random() * 0.7);
      const cy = innerHeight * (0.12 + Math.random() * 0.4);
      const color = colors[Math.floor(Math.random() * colors.length)]!;
      spawn(
        Array.from({ length: 46 }, () => {
          const a = Math.random() * Math.PI * 2;
          const v = 2 + Math.random() * 5;
          return {
            x: cx,
            y: cy,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            life: 0,
            ttl: 60 + Math.random() * 40,
            size: 1.8 + Math.random() * 2.4,
            color: Math.random() < 0.75 ? color : "#ffffff",
            gravity: 0.045,
          };
        }),
      );
    }, i * 260 + Math.random() * 120);
  }
}
