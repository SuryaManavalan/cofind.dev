import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Pause, Play } from "lucide-react";
import * as d3 from "d3-force";
import type { GraphData } from "../types";
import { api } from "../api";
import { Button } from "@/components/ui/button";

// The constellation (ADR-022): the room as a living graph. Tracks and people
// as nodes, weighted edges from contribution / crossings / interaction.
// The replay scrubber re-grows the room in creation order.

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  kind: "track" | "person";
  label: string;
  sub: string;
  size: number;
  born: number;
  slug?: string;
  handle?: string;
  personal: boolean;
  shipped: boolean;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  kind: string;
  weight: number;
  born: number;
}

const AVATAR_HUES = [262, 173, 330, 210, 25, 145];
function hueFor(handle: string): number {
  return AVATAR_HUES[[...handle].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_HUES.length]!;
}

export default function GraphView() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const focus = search.get("u")?.toLowerCase() ?? null;
  const [data, setData] = useState<GraphData | null>(null);
  const [tick, setTick] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [replayT, setReplayT] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ node: SimNode } | null>(null);

  useEffect(() => {
    api.graph().then(setData);
  }, []);

  const [t0, t1] = useMemo(() => {
    if (!data) return [0, 1];
    const times = [
      ...data.tracks.map((t) => t.created_at),
      ...data.people.map((p) => p.created_at),
      ...data.edges.map((e) => e.first_at),
    ];
    return [Math.min(...times), Math.max(...times, Date.now())];
  }, [data]);

  // build the simulation once data lands
  useEffect(() => {
    if (!data) return;
    const width = boxRef.current?.clientWidth ?? 800;
    const height = boxRef.current?.clientHeight ?? 600;

    let nodes: SimNode[] = [
      ...data.tracks.map((t) => ({
        id: t.node,
        kind: "track" as const,
        label: `#${t.slug}`,
        sub: `${t.post_count} stops`,
        size: 14 + Math.min(t.post_count * 3, 26),
        born: t.created_at,
        slug: t.slug,
        personal: !!t.owner,
        shipped: !!t.shipped_at,
      })),
      ...data.people.map((p) => ({
        id: p.node,
        kind: "person" as const,
        label: p.display_name,
        sub: `@${p.handle}`,
        size: 16 + Math.min(p.post_count, 14),
        born: p.created_at,
        handle: p.handle,
        personal: false,
        shipped: false,
      })),
    ];
    let links: SimLink[] = data.edges.map((e) => ({
      source: e.source,
      target: e.target,
      kind: e.kind,
      weight: e.weight,
      born: e.first_at,
    }));

    if (focus) {
      const me = nodes.find((n) => n.kind === "person" && n.handle?.toLowerCase() === focus);
      if (me) {
        const keep = new Set<string>([me.id]);
        for (const l of links) {
          const s = typeof l.source === "string" ? l.source : (l.source as SimNode).id;
          const t = typeof l.target === "string" ? l.target : (l.target as SimNode).id;
          if (s === me.id) keep.add(t);
          if (t === me.id) keep.add(s);
        }
        nodes = nodes.filter((n) => keep.has(n.id));
        links = links.filter((l) => {
          const s = typeof l.source === "string" ? l.source : (l.source as SimNode).id;
          const t = typeof l.target === "string" ? l.target : (l.target as SimNode).id;
          return keep.has(s) && keep.has(t);
        });
      }
    }

    nodesRef.current = nodes;
    linksRef.current = links;
    simRef.current?.stop();
    const sim = d3
      .forceSimulation<SimNode>(nodes)
      .force("charge", d3.forceManyBody().strength(-320))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((n) => n.id)
          .distance((l) => 120 - Math.min(l.weight * 8, 50))
          .strength(0.35),
      )
      .force("collide", d3.forceCollide<SimNode>().radius((n) => n.size + 14))
      .on("tick", () => setTick((v) => v + 1));
    simRef.current = sim;
    return () => {
      sim.stop();
    };
  }, [data, focus]);

  // replay playback
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => {
      setReplayT((t) => {
        const cur = t ?? t0;
        const next = cur + (t1 - t0) / 120;
        if (next >= t1) {
          setPlaying(false);
          return null;
        }
        return next;
      });
    }, 50);
    return () => clearInterval(iv);
  }, [playing, t0, t1]);

  const visible = useCallback(
    (born: number) => replayT === null || born <= replayT,
    [replayT],
  );

  // drag interactions
  const onPointerDown = (e: React.PointerEvent, node: SimNode) => {
    e.preventDefault();
    dragRef.current = { node };
    simRef.current?.alphaTarget(0.3).restart();
    node.fx = node.x;
    node.fy = node.y;
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || !boxRef.current) return;
      const rect = boxRef.current.getBoundingClientRect();
      d.node.fx = e.clientX - rect.left;
      d.node.fy = e.clientY - rect.top;
    };
    const up = () => {
      if (dragRef.current) {
        dragRef.current.node.fx = null;
        dragRef.current.node.fy = null;
        simRef.current?.alphaTarget(0);
        dragRef.current = null;
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  const connected = useMemo(() => {
    if (!hover) return null;
    const set = new Set<string>([hover]);
    for (const l of linksRef.current) {
      const s = (l.source as SimNode).id;
      const t = (l.target as SimNode).id;
      if (s === hover) set.add(t);
      if (t === hover) set.add(s);
    }
    return set;
  }, [hover, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  void tick;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2 sm:px-6">
        <p className="text-xs text-muted-foreground">
          {focus ? `@${focus}'s orbit` : "The room as a constellation"} — drag nodes, click to open. Node size = activity;
          edges = shared work.
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            title={playing ? "Pause replay" : "Replay the room's history"}
            onClick={() => {
              if (!playing && replayT === null) setReplayT(t0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <input
            type="range"
            min={t0}
            max={t1}
            value={replayT ?? t1}
            onChange={(e) => {
              setPlaying(false);
              const v = Number(e.target.value);
              setReplayT(v >= t1 ? null : v);
            }}
            className="w-36 accent-emerald-500"
            title="Scrub the room's history"
          />
        </div>
      </div>

      <div ref={boxRef} data-no-swipe className="relative flex-1 overflow-hidden">
        <svg className="absolute inset-0 size-full select-none">
          {linksRef.current.map((l, i) => {
            const s = l.source as SimNode;
            const t = l.target as SimNode;
            if (s.x === undefined || t.x === undefined) return null;
            if (!visible(l.born)) return null;
            const dim = connected && !(connected.has(s.id) && connected.has(t.id));
            return (
              <line
                key={i}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke={l.kind === "crossing" ? "#10b981" : "var(--brand)"}
                strokeOpacity={dim ? 0.06 : l.kind === "interacts" ? 0.25 : 0.35}
                strokeWidth={Math.min(1 + l.weight * 0.6, 5)}
                strokeDasharray={l.kind === "interacts" ? "3 4" : undefined}
              />
            );
          })}
        </svg>
        {nodesRef.current.map((n) => {
          if (n.x === undefined || n.y === undefined) return null;
          if (!visible(n.born)) return null;
          const dim = connected && !connected.has(n.id);
          return (
            <button
              key={n.id}
              onPointerDown={(e) => onPointerDown(e, n)}
              onPointerEnter={() => setHover(n.id)}
              onPointerLeave={() => setHover(null)}
              onClick={() => (n.kind === "track" ? navigate(`/t/${n.slug}`) : navigate(`/u/${n.handle}`))}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center transition-opacity"
              style={{ left: n.x, top: n.y, opacity: dim ? 0.15 : 1 }}
              title={`${n.label} · ${n.sub}`}
            >
              {n.kind === "person" ? (
                <span
                  className="flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-background"
                  style={{
                    width: n.size * 2,
                    height: n.size * 2,
                    fontSize: n.size * 0.8,
                    background: `linear-gradient(135deg, oklch(0.55 0.13 ${hueFor(n.handle!)}), oklch(0.42 0.11 ${hueFor(n.handle!) + 40}))`,
                  }}
                >
                  {n.label.slice(0, 1).toUpperCase()}
                </span>
              ) : (
                <span
                  className="rounded-full border-2"
                  style={{
                    width: n.size * 2,
                    height: n.size * 2,
                    borderColor: n.shipped ? "#10b981" : "color-mix(in srgb, #10b981 55%, transparent)",
                    background: n.shipped
                      ? "color-mix(in srgb, #10b981 25%, transparent)"
                      : "color-mix(in srgb, #10b981 10%, transparent)",
                    borderStyle: n.personal ? "solid" : "dashed",
                  }}
                />
              )}
              <span className="mt-1 max-w-28 truncate text-[10px] font-medium text-foreground/90">
                {n.kind === "track" ? n.label : n.sub}
              </span>
            </button>
          );
        })}
        {replayT !== null && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border bg-card/90 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            {new Date(replayT).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </div>
        )}
      </div>
    </div>
  );
}
