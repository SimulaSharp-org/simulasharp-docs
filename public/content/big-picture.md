# The big picture

One page for the whole mental model. Everything else in the guide is detail on the pieces named here.

## Time is published, not pushed

At the centre of a running simulation is a single **clock**
([`SimClock`](#/api/type/SimulaSharp.Kernel.Services.SimClock)). It runs on its own thread and does exactly one thing:
it advances **the horizon** — a single number, *elapsed simulation microseconds* — and publishes it. It never runs
your code. Time advances at **1:1 with real time**: after 100 ms of wall clock, the horizon has grown by 100 000 µs.

```mermaid
flowchart LR
  SW["Stopwatch<br/>(monotonic)"] --> CLK
  CLK["SimClock thread<br/>horizon += elapsed"] -->|"publishes long horizon (volatile)"| H(("horizon"))
  H -.->|read| A["SimSite A"]
  H -.->|read| B["SimSite B"]
  H -.->|read| C["SimSite C"]
```

Because the clock only *publishes* and never *calls*, there is no central scheduler that can become a bottleneck.
Each site reads the horizon and decides for itself what is now due.

## Work runs on SimSites — one thread each

A **SimSite** ([`SimSite`](#/api/type/SimulaSharp.Kernel.Services.SimSite)) is an independent scheduling domain: **one
thread, one event queue**. While the clock is running, a site fires everything now due, then parks until its next event
— the clock wakes it precisely on time (0% CPU while idle). Everything a site does happens on that one thread, so within
a site there is **no concurrency and no locking**.

Parallelism comes from having **several sites**. A model tree is partitioned into sites (you decide how — see
[choosing a topology](#/guide/choosing-a-topology)); each site runs in parallel with the others.

```mermaid
flowchart TB
  subgraph Site A
    QA["event queue"] --> TA["models: Plant · Pump · Valve"]
  end
  subgraph Site B
    QB["event queue"] --> TB["models: Radar · Tracker"]
  end
  TA -->|"Post / InjectAsync<br/>(cross-site inbox)"| TB
  TB -->|"Post / InjectAsync"| TA
```

- **Within a site**, models call each other **directly** — same thread, synchronous, lock-free.
- **Across sites**, calls are **marshalled**: the caller drops a message into the target site's lock-free inbox, which
  the target runs on *its* thread. Nothing blocks the sender.

## You describe a tree; the generator wires it

You author **models** (C# classes deriving [`ModelBase`](#/api/type/SimulaSharp.Kernel.Model.ModelBase)) and, when
you need a shared capability, **services**. You express how models relate with two dedicated types —
`Container<T>` for **ownership** (containment) and `Reference<T>` for **non-owning links**. You mark the values an
operator should see or change with `[Knob]`/`[Plottable]`, and the values the assembly should fill with `[Parameter]`.

Then you write a small **assembly** (`*.simassembly.yaml`) naming the sites, the services, and the model tree. At build
time a Roslyn generator reads it and emits a strongly-typed `<Name>Simulator` that constructs everything, wires the
associations, applies config, and exposes the knobs and plottables — all checked against your real types.

```mermaid
flowchart LR
  subgraph src["your class library"]
    MODELS["Model classes<br/>[Knob] [Plottable] [Parameter]"]
    YAML["plant.simassembly.yaml"]
  end
  MODELS --> GEN
  YAML --> GEN
  GEN["SimulatorGenerator<br/>(+ Knob/Plottable/Parameter/Ref/Service gens)"] --> OUT["PlantSimulator : SimulatorBase<br/>(assembles in ctor)"]
  GEN -->|"topology errors ⇒ SIM001–SIM020"| ERR["build errors"]
```

If the topology is wrong — an unknown type, a container/element mismatch, a dangling reference — you get a **compile
error** (`SIM001`–`SIM020`), not a runtime failure.

## Running it is a short lifecycle

The generated simulator is an [`ISimulator`](#/api/type/SimulaSharp.Kernel.Services.ISimulator). A host walks it
through four states, then tears it down. It is **single-use**: to start over, you make a new one.

```mermaid
stateDiagram-v2
  [*] --> Initialized: new PlantSimulator() — assemble tree, wire, params
  Initialized --> Configured: Configure() — each model's setup
  Configured --> Running: Start() — start sites + clock
  Running --> Running: Stop() freezes / Start() resumes
  Running --> [*]: Dispose() — single-use
```

Along the way the simulator exposes its **knobs** (observe + control) and **plottables** (telemetry), and fans **log
entries** out to any registered sink. Those are the surfaces a UI binds to.

## Observing and controlling from outside

Two channels reach into a running simulation, both discovered automatically at construction:

- **Knobs** — the unit of *observation and control*: a named readable value, a settable value, or a trigger. Marked
  with the `[*Knob]` attributes; streamed to a UI through an `IKnobChannel`.
- **Plottables** — the unit of *plot telemetry*: a named numeric sample. Marked with `[Plottable]`; the host sweeps
  them, one mission-time stamp per sweep.

## Packing lets a host load it

A finished simulator is **packed** as a `.nupkg` (via `dotnet pack`). The **Hosting** library loads that pack into a
**collectible `AssemblyLoadContext`**, discovers the simulators inside, creates one, and can **unload and reload** it
without restarting the host — the mechanism a hot-reloading MMI is built on.

---

That's the whole model: a clock publishes time, sites run work in parallel and message each other, you describe the
tree and the generator wires it, a short lifecycle runs it, and knobs/plottables/packing make it observable and
loadable. Next: **[the authoring model](#/guide/authoring-model)** — the three kinds of thing you actually write.
