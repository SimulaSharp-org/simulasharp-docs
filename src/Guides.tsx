import { useEffect, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { fetchDoc } from "./api";
import { Markdown } from "./Markdown";

export interface GuidePage { slug: string; title: string; file: string }
export interface GuideSection { title: string; pages: GuidePage[] }

let cache: Promise<GuideSection[]> | null = null;
function loadGuides(): Promise<GuideSection[]> {
  if (!cache)
    cache = fetch("./content/manifest.json")
      .then((r) => (r.ok ? r.json() : { sections: [] }))
      .then((j) => (j.sections as GuideSection[]) || [])
      .catch(() => []);
  return cache;
}

export function useGuides() {
  const [sections, setSections] = useState<GuideSection[]>([]);
  useEffect(() => { let live = true; loadGuides().then((s) => live && setSections(s)); return () => { live = false; }; }, []);
  return sections;
}

/** Sidebar nav for the authored guides — collapsible sections. */
export function GuideNav({ sections }: { sections: GuideSection[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => { if (sections.length) setOpen((o) => ({ [sections[0].title]: true, ...o })); }, [sections]);
  if (!sections.length) return null;
  return (
    <div className="tree">
      {sections.map((s) => {
        const isOpen = open[s.title] ?? false;
        return (
          <div key={s.title} className="tnode">
            <div className="trow" onClick={() => setOpen((o) => ({ ...o, [s.title]: !isOpen }))}>
              <span className="tw">{isOpen ? "▾" : "▸"}</span>
              <span className="tns">{s.title}</span>
              <span className="tc">{s.pages.length}</span>
            </div>
            {isOpen && (
              <div className="tchildren">
                {s.pages.map((p) => (
                  <NavLink key={p.slug} className={({ isActive }) => "ttype" + (isActive ? " on" : "")} to={`/guide/${p.slug}`}>{p.title}</NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function GuidePage() {
  const { slug = "" } = useParams();
  const sections = useGuides();
  const [md, setMd] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const page = sections.flatMap((s) => s.pages).find((p) => p.slug === slug);
  useEffect(() => {
    if (!page) return;
    let live = true; setMd(null); setMissing(false);
    fetchDoc(`./content/${page.file}`).then((t) => { if (live) { setMd(t); setMissing(t == null); } });
    return () => { live = false; };
  }, [page?.file]);
  if (sections.length && !page) return <div className="empty">Guide not found.</div>;
  if (missing) return <div className="empty">Content missing: {page?.file}</div>;
  if (md == null) return <div className="empty">Loading…</div>;
  return <Markdown source={md} />;
}
