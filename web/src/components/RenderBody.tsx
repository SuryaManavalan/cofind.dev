import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { RenderMode } from "../types";

// THE rendering pipeline (architecture doc §4). Every body from every write path
// (web composer or MCP tool) renders through this component. No entry point renders raw.

marked.setOptions({ gfm: true, breaks: true });

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?')\]])/g;

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
          part
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

const COLLAPSED_HEIGHT = 320;

// Strict CSP for the hostile frame: no network at all, inline style/script only,
// data: images. Combined with sandbox (no allow-same-origin) the content can't
// reach cofind's DOM, cookies, or tokens, and can't exfiltrate over the network.
const FRAME_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:;";

const FRAME_PRELUDE = `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">
<style>
  :root { color-scheme: light dark; }
  body { margin: 8px; font-family: ui-sans-serif, system-ui, sans-serif; color: light-dark(#18181b, #fafafa); background: transparent; }
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

function HtmlBody({ body }: { body: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [contentHeight, setContentHeight] = useState(COLLAPSED_HEIGHT);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source === iframeRef.current?.contentWindow && typeof e.data?.cofindFrameHeight === "number") {
        setContentHeight(Math.min(Math.max(e.data.cofindFrameHeight, 48), 4000));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const overflows = contentHeight > COLLAPSED_HEIGHT;
  return (
    <div>
      <iframe
        ref={iframeRef}
        // Hostile by default (ADR-004): scripts allowed for the "little artifact"
        // case, but no same-origin, no top-navigation, no forms, no popups.
        sandbox="allow-scripts"
        srcDoc={FRAME_PRELUDE + body}
        className="w-full rounded-lg border bg-muted/40 transition-[height]"
        style={{ height: expanded ? contentHeight : Math.min(contentHeight, COLLAPSED_HEIGHT) }}
        title="post content"
      />
      {overflows && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="mt-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      )}
    </div>
  );
}

export default function RenderBody({ body, mode }: { body: string; mode: RenderMode }) {
  if (mode === "markdown") return <MarkdownBody body={body} />;
  if (mode === "html") return <HtmlBody body={body} />;
  return <TextBody body={body} />;
}
