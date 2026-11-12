import { HashRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { Markdown } from "./Markdown";
import { useApi } from "./useApi";
import { ApiTree, ApiOverview, NsPage, TypePage } from "./ApiViews";
import { GuideNav, GuidePage, useGuides } from "./Guides";

const HOME = `# SimulaSharp

**SimulaSharp** is a C#/.NET 10 framework for building **hard-real-time, discrete-event simulations** as
**parallel actors**. You describe a system as a tree of *models* (and a few *services*), annotate the values you want
to control and plot, declare the topology in a small YAML *assembly*, and a source generator compiles it into a
strongly-typed, runnable, observable simulator.

The name is a nod to **SIMULA** — the language that introduced coroutine-based process modelling — echoed here by the
\`SimYield\` primitive and \`IEnumerator<SimYield>\` coroutines.

\`\`\`mermaid
flowchart LR
  DEV(["You — the author"]) -->|"models · services · [Knob]/[Plottable] · YAML assembly"| GEN
  subgraph BUILD["Build time"]
    GEN["Roslyn source generators<br/>(CodeGen)"] -->|emits| SIM["&lt;Name&gt;Simulator<br/>+ Refs · binders · config"]
  end
  SIM -->|compiles into| PACK[[".nupkg pack"]]
  subgraph RUN["Run time (Kernel)"]
    CLOCK["SimClock<br/>hard real-time horizon"] --> A["SimSite A<br/>(own thread)"]
    CLOCK --> B["SimSite B<br/>(own thread)"]
    A -. "Post / Inject" .- B
  end
  PACK -->|"loaded by a host (MMI)"| RUN
\`\`\`

## This guide

This is the **definitive guide to *designing* simulators** with SimulaSharp. It is organised as:

- **Concepts** — deep, diagram-first writeups of the model: [time & the clock](#/guide/time-and-clock),
  [SimSites & the actor model](#/guide/simsites-and-actors), [the event queue](#/guide/event-queue-and-scheduling),
  [coroutines](#/guide/coroutines), [models & containment](#/guide/models-and-containment),
  [associations](#/guide/associations), [services](#/guide/services), [observability](#/guide/observability),
  [the assembly](#/guide/the-assembly), [the lifecycle](#/guide/simulator-lifecycle), and
  [packing & hosting](#/guide/packing-and-hosting).
- **Designing a simulator** — how to make the calls: [choosing a topology](#/guide/choosing-a-topology),
  [modeling a subsystem](#/guide/modeling-a-subsystem), [interaction patterns](#/guide/interaction-patterns),
  and the [pitfalls](#/guide/pitfalls) to avoid.
- **Scenarios** — worked, end-to-end builds, from [hello-sim](#/guide/scenario-hello-sim) up to a
  [multi-subsystem satellite topology](#/guide/scenario-satellite).
- **[API reference](#/api)** — generated from the code, browsable by namespace → type → member.

New here? Start with the [introduction](#/guide/introduction) and [the big picture](#/guide/big-picture).

## The three parts

| Part | Role |
|------|------|
| **Kernel** | The runtime: the real-time \`SimClock\`, parallel single-threaded \`SimSite\`s, per-site event queues, coroutines, associations, knobs/plottables, logging. |
| **CodeGen** | Roslyn source generators that turn annotated models + a YAML assembly into the wiring: the \`<Name>Simulator\`, \`<Type>Ref\` accessors, knob/plottable binders, config binding. |
| **Hosting** | Loads a packed simulator (\`.nupkg\`) into a collectible context so a host (the MMI) can run and hot-reload it. |
`;

const navcls = ({ isActive }: { isActive: boolean }) => "lnk" + (isActive ? " on" : "");

function Sidebar() {
  const loc = useLocation();
  const { model } = useApi();
  const sections = useGuides();
  const inApi = loc.pathname.startsWith("/api");
  return (
    <nav className="side">
      <div className="brand"><img src="./logo.svg" alt="" /><span>SimulaSharp <b>Docs</b></span></div>
      <NavLink to="/" end className={navcls}>Home</NavLink>
      <h3 className="sidehdr">Guide</h3>
      <GuideNav sections={sections} />
      <h3 className="sidehdr">API reference</h3>
      <NavLink to="/api" className={navcls} end>Overview</NavLink>
      {inApi && (model ? <ApiTree model={model} /> : <div className="dim">loading tree…</div>)}
    </nav>
  );
}

export function App() {
  return (
    <HashRouter>
      <div className="wrap">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/" element={<Markdown source={HOME} />} />
            <Route path="/guide/:slug" element={<GuidePage />} />
            <Route path="/api" element={<ApiOverview />} />
            <Route path="/api/ns/:ns" element={<NsPage />} />
            <Route path="/api/type/:full" element={<TypePage />} />
            <Route path="*" element={<div className="empty">Not found.</div>} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
