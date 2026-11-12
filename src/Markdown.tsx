import { useEffect, useRef } from "react";
import { marked } from "marked";
import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose", themeVariables: { fontSize: "13px" } });

let mid = 0;

/** Render a markdown string to HTML, then upgrade ```mermaid``` fences to rendered diagrams. */
export function Markdown({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.innerHTML = marked.parse(source);
    host.querySelectorAll<HTMLElement>("code.language-mermaid").forEach(async (code) => {
      const pre = code.closest("pre");
      const box = document.createElement("div");
      box.className = "mermaid";
      (pre ?? code).replaceWith(box);
      try {
        const { svg } = await mermaid.render("m" + mid++, code.textContent || "");
        box.innerHTML = svg;
      } catch {
        box.innerHTML = "<pre>" + (code.textContent || "") + "</pre>";
      }
    });
  }, [source]);

  // In-page anchors ("#heading-id") would be read by the HashRouter as a route and end on "Not found".
  // Scroll to the heading instead; app routes ("#/...") pass through untouched.
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const onClick = (e: MouseEvent) => {
      const href = (e.target as HTMLElement).closest("a")?.getAttribute("href");
      if (!href || !href.startsWith("#") || href.startsWith("#/")) return;
      e.preventDefault();
      host.querySelector(`#${CSS.escape(decodeURIComponent(href.slice(1)))}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, []);

  return <div className="md" ref={ref} />;
}
