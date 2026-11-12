// Parse the .NET XML documentation files (emitted by <GenerateDocumentationFile>) into an API model.
// The member-id attributes encode the namespace -> type -> member tree and parameter types; the child
// tags (<summary>/<remarks>/<param>/<returns>) provide the prose. There is no separate extractor.

export type MemberKind = "method" | "property" | "field" | "event";
export type TypeKind = "class" | "struct" | "interface" | "enum" | "delegate" | "type";

export interface Param { name: string; type: string }

export interface DocMember {
  kind: MemberKind;
  name: string;         // simple member name (with generic arity stripped)
  signature: string;    // e.g. "AddEvent(Action action, long delayUs)"
  params: Param[];
  summaryHtml?: string;
  remarksHtml?: string;
  returnsHtml?: string;
  paramDocs: Record<string, string>;
  assembly: string;
  raw: string;          // raw id (after prefix)
}

export interface TypeNode {
  full: string;         // namespace.TypeName, generic arity kept (Foo`1), so Foo and Foo<T> stay distinct
  ns: string;
  name: string;         // display name, generic parameters spelled out (Foo<T>)
  kind: TypeKind;
  summaryHtml?: string;
  remarksHtml?: string;
  assembly: string;
  members: DocMember[];
}

export interface NsNode { name: string; types: TypeNode[] }
export interface ApiModel {
  assemblies: string[];
  namespaces: NsNode[];
  types: Map<string, TypeNode>;   // by full name
}

const PRIM: Record<string, string> = {
  "System.Void": "void", "System.Boolean": "bool", "System.Byte": "byte", "System.SByte": "sbyte",
  "System.Int16": "short", "System.UInt16": "ushort", "System.Int32": "int", "System.UInt32": "uint",
  "System.Int64": "long", "System.UInt64": "ulong", "System.Single": "float", "System.Double": "double",
  "System.Char": "char", "System.String": "string", "System.Object": "object", "System.Decimal": "decimal",
};

/** Shorten a doc-id type reference to a readable C# form. */
export function shortType(t: string): string {
  t = t.trim();
  let suffix = "";
  while (t.endsWith("@")) { t = t.slice(0, -1); suffix = " " + "ref" ; }          // by-ref
  // array
  const arr = t.match(/^(.*?)(\[[,\]]*\])$/);
  if (arr) return shortType(arr[1]) + arr[2] + suffix;
  // generic:  Ns.Type{A,B}
  const g = t.match(/^(.*?)\{(.*)\}$/);
  if (g) {
    const base = g[1].replace(/`\d+$/, "");
    const baseName = PRIM[base] ?? base.split(".").pop()!.replace(/`\d+$/, "");
    return baseName + "<" + splitTop(g[2]).map(shortType).join(", ") + ">" + suffix;
  }
  if (PRIM[t]) return PRIM[t] + suffix;
  // generic type-parameter refs like ``0 / `0
  if (/^``?\d+$/.test(t)) return "T" + suffix;
  return t.split(".").pop()!.replace(/`\d+$/, "") + suffix;
}

/** Split a comma-separated list at top level (respecting {} nesting). */
function splitTop(s: string): string[] {
  const out: string[] = []; let depth = 0, cur = "";
  for (const c of s) {
    if (c === "{") depth++; else if (c === "}") depth--;
    if (c === "," && depth === 0) { out.push(cur); cur = ""; } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const kindFromPrefix: Record<string, MemberKind> = { M: "method", P: "property", F: "field", E: "event" };

// Block-level doc tags that are NOT part of the summary prose.
const BLOCK_TAGS = new Set(["param", "typeparam", "returns", "remarks", "exception", "example", "value", "seealso"]);

/** Convert a doc-comment element's children to HTML, resolving see/paramref/c/para/list. `skip` drops named child tags. */
function nodeToHtml(node: Node, skip?: Set<string>): string {
  let out = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) { out += (n.textContent || "").replace(/\s+/g, " "); return; }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    if (skip && skip.has(tag)) return;
    if (tag === "see" || tag === "seealso") {
      const cref = el.getAttribute("cref");
      const lang = el.getAttribute("langword");
      const href = el.getAttribute("href");
      if (lang) out += `<code>${lang}</code>`;
      else if (cref) { const { text, route } = crefLink(cref); out += route ? `<a href="${route}"><code>${text}</code></a>` : `<code>${text}</code>`; }
      else if (href) out += `<a href="${href}" target="_blank" rel="noreferrer">${el.textContent || href}</a>`;
      else out += `<code>${el.textContent || ""}</code>`;
    } else if (tag === "paramref" || tag === "typeparamref") {
      out += `<code>${el.getAttribute("name") || ""}</code>`;
    } else if (tag === "c") {
      out += `<code>${el.textContent || ""}</code>`;
    } else if (tag === "code") {
      out += `<pre><code>${el.textContent || ""}</code></pre>`;
    } else if (tag === "para") {
      out += `<p>${nodeToHtml(el)}</p>`;
    } else if (tag === "list") {
      const items = Array.from(el.getElementsByTagName("item")).map((it) => `<li>${nodeToHtml(it)}</li>`).join("");
      out += `<ul>${items}</ul>`;
    } else {
      out += nodeToHtml(el, skip);
    }
  });
  return out.trim();
}

/** The summary prose: a <summary> child if present, otherwise the member's bare text (C# emits tagless `/// text` directly). */
function getSummary(m: Element): string | undefined {
  const s = m.getElementsByTagName("summary")[0];
  const html = s ? nodeToHtml(s) : nodeToHtml(m, BLOCK_TAGS);
  return html || undefined;
}

/** Map a cref (e.g. "T:SimulaSharp.Kernel.Services.SimClock") to display text + in-app route. */
export function crefLink(cref: string): { text: string; route: string | null } {
  const prefix = cref[1] === ":" ? cref[0] : "";
  const body = cref.includes(":") ? cref.slice(cref.indexOf(":") + 1) : cref;
  if (prefix === "T") {
    return { text: body.split(".").pop()!.replace(/`\d+$/, ""), route: `#/api/type/${encodeURIComponent(body)}` };
  }
  if (prefix === "M" || prefix === "P" || prefix === "F" || prefix === "E") {
    const noSig = body.replace(/\(.*\)$/, "");
    const parts = noSig.split(".");
    const member = parts.pop()!;
    const typeFull = parts.join(".");
    return { text: member.replace(/`+\d+$/, ""), route: `#/api/type/${encodeURIComponent(typeFull)}` };
  }
  return { text: body.split(".").pop() || body, route: null };
}

function childHtml(member: Element, tag: string): string | undefined {
  const el = member.getElementsByTagName(tag)[0];
  return el ? nodeToHtml(el) : undefined;
}

/** Parse one assembly's XML doc text into member records. */
export function parseAssemblyXml(xmlText: string, assembly: string): { types: Map<string, TypeNode>; orphans: DocMember[] } {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const members = Array.from(doc.getElementsByTagName("member"));
  const types = new Map<string, TypeNode>();

  // First pass: types.
  for (const m of members) {
    const id = m.getAttribute("name") || "";
    if (id[0] !== "T") continue;
    const full = id.slice(2);
    const ns = full.includes(".") ? full.slice(0, full.lastIndexOf(".")) : "";
    // Foo`2 → Foo<TKey, TValue>, from the type's own <typeparam> docs; T1..Tn when they are missing.
    const last = full.split(".").pop()!;
    const arity = Number(last.match(/`(\d+)$/)?.[1] ?? 0);
    const tps = Array.from(m.getElementsByTagName("typeparam")).map((p) => p.getAttribute("name") || "");
    const name = arity
      ? `${last.replace(/`\d+$/, "")}<${Array.from({ length: arity }, (_, i) => tps[i] || `T${i + 1}`).join(", ")}>`
      : last;
    types.set(full, {
      full, ns, name, kind: "type",
      summaryHtml: getSummary(m), remarksHtml: childHtml(m, "remarks"),
      assembly, members: [],
    });
  }

  // Second pass: members.
  const orphans: DocMember[] = [];
  for (const m of members) {
    const id = m.getAttribute("name") || "";
    const kind = kindFromPrefix[id[0]];
    if (!kind) continue;
    const body = id.slice(2);
    const noSig = body.replace(/\(.*\)$/, "");
    // declaring type = longest known type prefix
    let declFull = "";
    for (const t of types.keys()) {
      if ((noSig + ".").startsWith(t + ".") && t.length > declFull.length) declFull = t;
    }
    let memberName: string;
    if (declFull) memberName = noSig.slice(declFull.length + 1);
    else { const i = noSig.lastIndexOf("."); declFull = noSig.slice(0, i); memberName = noSig.slice(i + 1); }
    memberName = memberName.replace(/#ctor/, declFull.split(".").pop()!).replace(/`+\d+/, "").replace(/#/g, ".");

    // params from the signature
    const sig = body.match(/\((.*)\)$/);
    const paramTypes = sig ? splitTop(sig[1]).map(shortType) : [];
    const paramDocs: Record<string, string> = {};
    Array.from(m.getElementsByTagName("param")).forEach((p) => { paramDocs[p.getAttribute("name") || ""] = nodeToHtml(p); });
    const paramNames = Object.keys(paramDocs);
    const params: Param[] = paramTypes.map((t, i) => ({ type: t, name: paramNames[i] || `a${i + 1}` }));
    const signature = kind === "method"
      ? `${memberName}(${params.map((p) => `${p.type} ${p.name}`).join(", ")})`
      : memberName;

    const rec: DocMember = {
      kind, name: memberName, signature, params, paramDocs,
      summaryHtml: getSummary(m), remarksHtml: childHtml(m, "remarks"), returnsHtml: childHtml(m, "returns"),
      assembly, raw: body,
    };
    const t = types.get(declFull);
    if (t) t.members.push(rec); else orphans.push({ ...rec, name: `${declFull}.${memberName}` });
  }
  return { types, orphans };
}

/**
 * Fetch optional text content, returning null when it's absent. A dev server (Vite) answers a missing path with the
 * SPA's index.html at HTTP 200 rather than a 404, so guard against that fallback by content-type and body sniffing.
 */
export async function fetchDoc(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("text/html")) return null;
    const txt = await r.text();
    if (/<!doctype html|<html|id="root"|@vite\/client/i.test(txt.slice(0, 400))) return null;
    return txt.trim() ? txt : null;
  } catch {
    return null;
  }
}

/** Load index.json + every assembly's XML and assemble the full model. */
export async function loadApiModel(base = "./api"): Promise<ApiModel> {
  const index = await (await fetch(`${base}/index.json`)).json();
  const all = new Map<string, TypeNode>();
  const assemblies: string[] = [];
  for (const a of index.assemblies as { name: string; file: string }[]) {
    assemblies.push(a.name);
    const xml = await (await fetch(`${base}/${a.file}`)).text();
    const { types } = parseAssemblyXml(xml, a.name);
    for (const [full, t] of types) if (!all.has(full)) all.set(full, t);
  }
  // Fold nested types under the namespace of their outermost documented enclosing type, qualifying the display
  // name — e.g. Outer.Inner and Outer.Mid.Inner both land in Outer's namespace. The direct parent may itself be
  // undocumented (absent from the XML), so the walk looks at every prefix, not just the immediate one; without
  // that, the parent's full name would show up as a namespace of its own.
  const known = new Set(all.keys());
  for (const t of all.values()) {
    const segs = t.full.split(".");
    for (let i = 1; i < segs.length - 1; i++) {
      if (!known.has(segs.slice(0, i + 1).join("."))) continue;
      t.ns = segs.slice(0, i).join(".");
      t.name = [...segs.slice(i, -1).map((s) => s.replace(/`\d+$/, "")), t.name].join(".");
      break;
    }
  }
  const nsMap = new Map<string, TypeNode[]>();
  for (const t of all.values()) { (nsMap.get(t.ns) ?? nsMap.set(t.ns, []).get(t.ns)!).push(t); }
  const namespaces: NsNode[] = [...nsMap.entries()]
    .map(([name, tps]) => ({ name, types: tps.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { assemblies, namespaces, types: all };
}
