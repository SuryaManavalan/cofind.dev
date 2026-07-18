import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { Maximize2 } from "lucide-react";
import type { RenderMode } from "../types";

// THE rendering pipeline (architecture doc §4). Every body from every write path
// (web composer or MCP tool) renders through this component. No entry point renders raw.
//
// Two variants (ADR-016):
//   "preview" — feed/gallery card: capped height; html posts may nominate a
//               [data-cofind="card"] element as their card face.
//   "full"    — thread view: the whole document, whole height.

marked.setOptions({ gfm: true, breaks: true });

// @mentions become styled, clickable spans in markdown too (asks, ADR-017).
marked.use({
  extensions: [
    {
      name: "mention",
      level: "inline",
      start(src: string) {
        return src.match(/@[a-zA-Z0-9_]/)?.index;
      },
      tokenizer(src: string) {
        const match = /^@([a-zA-Z0-9_]{2,24})/.exec(src);
        if (match) return { type: "mention", raw: match[0], handle: match[1] };
        return undefined;
      },
      renderer(token) {
        const handle = (token as unknown as { handle: string }).handle;
        return `<span data-mention="${handle}">@${handle}</span>`;
      },
    },
  ],
});

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

type Variant = "preview" | "full";

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?')\]])/g;
const MENTION_SPLIT_RE = /(@[a-zA-Z0-9_]{2,24})/g;

function withMentions(text: string, keyBase: string): React.ReactNode[] {
  return text.split(MENTION_SPLIT_RE).map((chunk, j) =>
    MENTION_SPLIT_RE.test(chunk) ? (
      // An ask (ADR-017): @handle routes to that member's agent via catch_up.
      <span key={`${keyBase}-${j}`} data-mention={chunk.slice(1)} title="Delivered to their agent via catch_up — click for their profile">
        {chunk}
      </span>
    ) : (
      chunk
    ),
  );
}

function TextBody({ body }: { body: string }) {
  const parts = body.split(URL_RE);
  return (
    <p className="prose-post whitespace-pre-wrap">
      {parts.map((part, i) =>
        URL_RE.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-2">
            {part}
          </a>
        ) : (
          withMentions(part, String(i))
        ),
      )}
    </p>
  );
}

function MarkdownBody({ body }: { body: string }) {
  const html = useMemo(() => {
    const rendered = marked.parse(body, { async: false }) as string;
    // MD-embedded raw HTML is never trusted — sanitize the full output.
    return DOMPurify.sanitize(rendered, { FORBID_TAGS: ["style", "form", "input"], USE_PROFILES: { html: true } });
  }, [body]);
  return <div className="prose-post" dangerouslySetInnerHTML={{ __html: html }} />;
}

// Preview cap for text/markdown: card height with a fade + read-more affordance.
const PREVIEW_MAX_PX = 416;

function CappedPreview({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollHeight > PREVIEW_MAX_PX + 8);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative">
      <div ref={ref} style={{ maxHeight: PREVIEW_MAX_PX }} className="overflow-hidden">
        {children}
      </div>
      {overflowing && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-20 items-end justify-center bg-gradient-to-t from-background to-transparent pb-1">
          <span className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
            <Maximize2 className="size-3" /> read the full post
          </span>
        </div>
      )}
    </div>
  );
}

const PREVIEW_FRAME_MAX = 320;
const FULL_FRAME_MAX = 4000;

// Strict CSP for the hostile frame: no network at all, inline style/script only,
// data: images. Combined with sandbox (no allow-same-origin) the content can't
// reach cofind's DOM, cookies, or tokens, and can't exfiltrate over the network.
const FRAME_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:;";

// Theme tokens flow into the hostile frame (ADR-018): post HTML styled with
// var(--token) matches every viewer's theme, live. Values are the *declared*
// custom-property strings (hex / color-mix of literals), valid inside the frame.
const FRAME_TOKENS = [
  "background", "foreground", "card", "card-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "primary", "primary-foreground", "border", "brand", "radius",
];

function frameThemeCss(): string {
  const cs = getComputedStyle(document.documentElement);
  const vars = FRAME_TOKENS.map((n) => `--${n}: ${cs.getPropertyValue(`--${n}`).trim()};`).join(" ");
  const mode = document.documentElement.dataset.mode ?? "dark";
  return `:root { color-scheme: ${mode}; ${vars} } body { color: var(--foreground); }`;
}

const FRAME_PRELUDE = `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">
<style>
  body { margin: 8px; font-family: ui-sans-serif, system-ui, sans-serif; background: transparent; }
  * { scrollbar-width: thin; scrollbar-color: rgba(128,128,140,.4) transparent; }
  *::-webkit-scrollbar { width: 8px; height: 8px; }
  *::-webkit-scrollbar-track { background: transparent; }
  *::-webkit-scrollbar-thumb { background: rgba(128,128,140,.4); border-radius: 8px; }
</style>
<script>
  // Measure the body, not documentElement — the latter reports the iframe
  // viewport height, which would lock in dead space below short content.
  const report = () => parent.postMessage({ cofindFrameHeight: document.body.scrollHeight + 18 }, "*");
  addEventListener("load", () => {
    report();
    new ResizeObserver(report).observe(document.body);
  });
</script>`;

// The card convention (ADR-016): an html post may mark ONE element with
// data-cofind="card". The feed/gallery render just that element (plus the
// document's <style> tags) as the card face; the full document renders in the
// thread view. Scripts are preview-stripped implicitly — they live outside the
// card — so card faces stay static and cheap.
function extractCard(body: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(body, "text/html");
    const card = doc.querySelector('[data-cofind="card"]');
    if (!card) return null;
    const styles = Array.from(doc.querySelectorAll("style"))
      .map((s) => s.outerHTML)
      .join("");
    // Preserve the ancestor chain as empty shells so descendant selectors
    // scoped to a wrapper (e.g. ".tk .kpis > div") still match the card.
    let node: Element = card.cloneNode(true) as Element;
    let parent = card.parentElement;
    while (parent && parent.tagName !== "BODY" && parent.tagName !== "HTML") {
      const shell = parent.cloneNode(false) as Element;
      shell.appendChild(node);
      node = shell;
      parent = parent.parentElement;
    }
    return styles + node.outerHTML;
  } catch {
    return null;
  }
}

function HtmlBody({ body, variant }: { body: string; variant: Variant }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [contentHeight, setContentHeight] = useState(PREVIEW_FRAME_MAX);
  const [themeCss, setThemeCss] = useState(frameThemeCss);

  useEffect(() => {
    const onTheme = () => setThemeCss(frameThemeCss());
    window.addEventListener("cofind:theme", onTheme);
    return () => window.removeEventListener("cofind:theme", onTheme);
  }, []);

  const cardHtml = variant === "preview" ? extractCard(body) : null;
  const frameBody = cardHtml ?? body;
  const maxHeight = variant === "preview" ? PREVIEW_FRAME_MAX : FULL_FRAME_MAX;

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source === iframeRef.current?.contentWindow && typeof e.data?.cofindFrameHeight === "number") {
        setContentHeight(Math.max(e.data.cofindFrameHeight, 48));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const truncated = variant === "preview" && !cardHtml && contentHeight > PREVIEW_FRAME_MAX;

  return (
    <div className="relative">
      <iframe
        ref={iframeRef}
        // Hostile by default (ADR-004): scripts allowed for the "little artifact"
        // case, but no same-origin, no top-navigation, no forms, no popups.
        sandbox="allow-scripts"
        srcDoc={`${FRAME_PRELUDE}<style>${themeCss}</style>${frameBody}`}
        className="w-full rounded-lg border bg-muted/40 transition-[height]"
        style={{ height: Math.min(contentHeight, maxHeight) }}
        title="post content"
      />
      {variant === "preview" && (
        // Click-shield: the sandboxed frame would otherwise swallow clicks, making
        // the card dead to "open the thread." Previews are look-only; interaction
        // (scripts, scrolling the artifact) belongs to the opened view.
        <div className="absolute inset-0 cursor-pointer" />
      )}
      {variant === "preview" && (cardHtml || truncated) && (
        <div className="pointer-events-none absolute bottom-2 right-2">
          <span className="flex items-center gap-1.5 rounded-full border bg-card/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">
            <Maximize2 className="size-3" /> open the full artifact
          </span>
        </div>
      )}
    </div>
  );
}

export default function RenderBody({
  body,
  mode,
  variant = "preview",
}: {
  body: string;
  mode: RenderMode;
  variant?: Variant;
}) {
  const navigate = useNavigate();
  if (mode === "html") return <HtmlBody body={body} variant={variant} />;
  const inner = mode === "markdown" ? <MarkdownBody body={body} /> : <TextBody body={body} />;
  // Event delegation: any [data-mention] span (text or markdown) opens the
  // member's profile without triggering the surrounding card's navigation.
  const handleMentionClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest?.("[data-mention]") as HTMLElement | null;
    if (target?.dataset.mention) {
      e.stopPropagation();
      navigate(`/u/${target.dataset.mention}`);
    }
  };
  const wrapped = <div onClick={handleMentionClick}>{inner}</div>;
  if (variant === "preview") return <CappedPreview>{wrapped}</CappedPreview>;
  return wrapped;
}
