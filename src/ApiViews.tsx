import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useApi } from "./useApi";
import { fetchDoc, type ApiModel, type DocMember, type TypeNode } from "./api";
import { Markdown } from "./Markdown";

const KIND_LABEL: Record<string, string> = { method: "Methods", property: "Properties", event: "Events", field: "Fields" };
const KIND_ORDER = ["method", "property", "event", "field"];

function Html({ html, className }: { html?: string; className?: string }) {
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Collapsible namespace → type tree for the sidebar. */
export function ApiTree({ model }: { model: ApiModel }) {
  const loc = useLocation();
  const typeMatch = loc.pathname.match(/^\/api\/type\/(.+)$/);
  const nsMatch = loc.pathname.match(/^\/api\/ns\/(.+)$/);
  const activeFull = typeMatch ? decodeURIComponent(typeMatch[1]) : undefined;
  const activeNs = activeFull ? model.types.get(activeFull)?.ns : nsMatch ? decodeURIComponent(nsMatch[1]) : undefined;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => { if (activeNs) setOpen((o) => ({ ...o, [activeNs]: true })); }, [activeNs]);

  return (
    <div className="tree">
      {model.namespaces.map((ns) => {
        const isOpen = open[ns.name] ?? false;
        return (
          <div key={ns.name} className="tnode">
            <div className="trow" onClick={() => setOpen((o) => ({ ...o, [ns.name]: !isOpen }))}>
              <span className="tw">{isOpen ? "▾" : "▸"}</span>
              <Link className="tns" to={`/api/ns/${encodeURIComponent(ns.name)}`} onClick={(e) => e.stopPropagation()}>{ns.name || "(global)"}</Link>
              <span className="tc">{ns.types.length}</span>
            </div>
            {isOpen && (
              <div className="tchildren">
                {ns.types.map((t) => (
                  <Link key={t.full} className={"ttype" + (t.full === activeFull ? " on" : "")} to={`/api/type/${encodeURIComponent(t.full)}`}>{t.name}</Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ApiOverview() {
  const { model, error } = useApi();
  if (error) return <div className="empty">Failed to load API model: {error}</div>;
  if (!model) return <div className="empty">Loading API reference…</div>;
  const typeCount = model.types.size;
  return (
    <div className="md">
      <h1>API reference</h1>
      <p className="sub">{model.assemblies.length} assemblies · {model.namespaces.length} namespaces · {typeCount} types. Generated from the projects' XML documentation ({model.generated}).</p>
      <h2>Namespaces</h2>
      <div className="cards">
        {model.namespaces.map((ns) => (
          <Link key={ns.name} className="card" to={`/api/ns/${encodeURIComponent(ns.name)}`}>
            <div className="t">{ns.name || "(global)"}</div>
            <div className="meta">{ns.types.length} types</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function NsPage() {
  const { ns = "" } = useParams();
  const { model } = useApi();
  const [nsDoc, setNsDoc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setNsDoc(null);
    fetchDoc(`./api-ns/${encodeURIComponent(ns)}.md`).then((t) => { if (live) setNsDoc(t); });
    return () => { live = false; };
  }, [ns]);
  if (!model) return <div className="empty">Loading…</div>;
  const node = model.namespaces.find((n) => n.name === ns);
  if (!node) return <div className="empty">Unknown namespace.</div>;
  return (
    <div className="md">
      <div className="crumb"><Link to="/api">API</Link> / {ns}</div>
      <h1>{ns}</h1>
      {nsDoc ? <Markdown source={nsDoc} /> : <p className="sub">Namespace-level documentation for <code>{ns}</code> can be authored at <code>public/api-ns/{ns}.md</code>.</p>}
      <h2>Types ({node.types.length})</h2>
      <table>
        <thead><tr><th>type</th><th>summary</th></tr></thead>
        <tbody>
          {node.types.map((t) => (
            <tr key={t.full}>
              <td><Link to={`/api/type/${encodeURIComponent(t.full)}`}>{t.name}</Link></td>
              <td><Html html={t.summaryHtml} className="doc" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemberRow({ m }: { m: DocMember }) {
  return (
    <div className="member">
      <div className="msig mono">{m.signature}</div>
      <Html html={m.summaryHtml} className="doc" />
      {m.params.length > 0 && Object.keys(m.paramDocs).length > 0 && (
        <table className="params">
          <tbody>
            {m.params.map((p) => (
              <tr key={p.name}><td className="mono">{p.name}</td><td className="mono doc">{p.type}</td><td><Html html={m.paramDocs[p.name]} /></td></tr>
            ))}
          </tbody>
        </table>
      )}
      {m.returnsHtml && <div className="ret"><span className="lbl">returns</span> <Html html={m.returnsHtml} /></div>}
      {m.remarksHtml && <Html html={m.remarksHtml} className="remarks" />}
    </div>
  );
}

export function TypePage() {
  const { full = "" } = useParams();
  const { model } = useApi();
  const t: TypeNode | undefined = useMemo(() => model?.types.get(full), [model, full]);
  if (!model) return <div className="empty">Loading…</div>;
  if (!t) return <div className="empty">Type not found: {full}</div>;
  const groups = KIND_ORDER.map((k) => ({ k, items: t.members.filter((m) => m.kind === k).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.items.length);
  return (
    <div className="md">
      <div className="crumb"><Link to="/api">API</Link> / <Link to={`/api/ns/${encodeURIComponent(t.ns)}`}>{t.ns}</Link> / {t.name}</div>
      <h1>{t.name}</h1>
      <div className="sub"><code>{t.full}</code> · <span className="pill">{t.assembly}</span></div>
      <Html html={t.summaryHtml} className="summary" />
      <Html html={t.remarksHtml} className="remarks" />
      {groups.map((g) => (
        <section key={g.k}>
          <h2>{KIND_LABEL[g.k]} ({g.items.length})</h2>
          {g.items.map((m, i) => <MemberRow key={m.raw + i} m={m} />)}
        </section>
      ))}
      {!groups.length && <p className="sub">No documented members.</p>}
    </div>
  );
}
