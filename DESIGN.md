# SimulaSharp — Framework Design

This document describes the **whole effort**: what SimulaSharp is meant to become,
how a developer authors simulations with it, and the design decisions that shape
it. For the low-level kernel internals (clock, SimSites, event queue, coroutines)
see [ARCHITECTURE.md](./ARCHITECTURE.md).

> Status (2026-07): early greenfield. The **Kernel** exists; the **codegen
> library** and **MMI** are designed-but-unbuilt. Several decisions below are
> agreed but not yet implemented.

---

## 1. The three parts

SimulaSharp is a **framework for authoring and running simulations**, in three
pieces:

1. **Kernel** *(exists)* — the timing/scheduling core: a real-time clock, parallel
   single-threaded **SimSites**, per-site event queues, and SIMULA-style
   coroutines. See [ARCHITECTURE.md](./ARCHITECTURE.md).

2. **Attribute-driven codegen library** *(planned)* — a Roslyn source generator
   that turns annotated model code into the boilerplate that wires it onto the
   kernel (construction, associations, cross-site accessors, observability).

3. **MMI (Man-Machine Interface)** *(planned)* — an **ASP.NET Core + SignalR**
   backend and a **Vite** frontend that load a developer's compiled simulation,
   provide the scheduling/timekeeping instrumentation, and let an operator
   control and visualize a run.

A developer builds the simulation; the MMI is the runtime host and operator
console.

---

## 2. What a developer authors

Three kinds of artifact:

- **Simulation Models** — the simulated entities: state + behavior (events,
  periodic actions, coroutine "processes").
- **Simulation Services** — reusable cross-cutting capabilities that Models
  depend on. Each Service runs on its **own SimSite**.
- **Simulation Assemblies** — the composition/topology: which Models and Services
  are instantiated and how they interconnect. The Assembly is the artifact the
  MMI loads.

---

## 3. Concurrency model: the hierarchy *is* the scheduling domain

Models form a **tree**. A **root model is attached to a SimSite**, and its
**entire subtree shares that SimSite** — the same scheduler, thread, and event
queue. A SimSite may host **one or more** root models.

This gives the developer a single, explicit concurrency lever:

- **Within a site** (a subtree, or co-located roots): everything runs on one
  thread, so closely-bound models call each other **directly, lock-free**. This
  is the common, fast path.
- **Across sites**: interactions are cross-thread and go through the kernel's
  **guarded** path (`Post` / `InjectAsync` onto the target site's inbox).

Because dispatch is chosen at runtime (see §4), **models are
location-transparent and reusable** — a model doesn't need to know, at authoring
time, whether a given peer lives on its site or another.

---

## 4. Associations

Models relate in exactly two ways, each expressed by a **dedicated generic
collection type** (the type *is* the declaration — no marker attribute needed):

| Kind | Type | Meaning | Dispatch |
| --- | --- | --- | --- |
| **Containment** | `Container<T>` | Owning parent→child; child subtree shares the parent's site | Direct, synchronous |
| **Reference** | `Reference<T>` | Non-owning link to another model; may be intra- or cross-site | Runtime `callerSite` compare |

Both are **list-based** (1→N).

**Generated `<Type>Ref` smart accessors.** For each model `Type`, the codegen
emits a `<Type>Ref` wrapper exposing the model's public members. Every accessor
takes an extra `callerSite` argument (the caller's own site), compares it to the
target's site, and dispatches:

- **same site** → direct call, completing synchronously;
- **different site** → routed via SimSite inject, completing later.

All accessors are **uniformly async-shaped (`ValueTask`)**; the same-site path
completes synchronously and stays allocation-free. This uniformity is what makes
models location-transparent, and it eliminates any intra-site await-deadlock (a
same-site reference never actually awaits).

**Observability is orthogonal** — a model exposes observable state on *its own*
members (via an `[Observable]`-style attribute), never through a `<Type>Ref`.

---

## 5. Assembly description (YAML)

An Assembly is described in **YAML** — the first concrete syntax over a canonical
`AssemblyDescriptor` object graph (so the format is swappable; a visual assembler
tool or DSL could target the same graph later). One file = one Simulator.

```yaml
Simulator:
  Name: RadarSim
  Services:                 # each service sits on its own SimSite
    - Name: Tracker
      Type: TrackerService
      Config: { Gain: 3 }
  Sites:                    # explicit, first-class scheduling domains
    - Name: Alpha           # optional: MMI label + site-level config target
      MaxEvents: 4096       # optional site-level tuning
      Models:               # root models on this site (share its thread)
        - Name: Radar1
          Type: RadarModel
          Description: Primary radar
          Config: { Range: 200 }
          Dependencies: [ Tracker ]   # bind service instances by name
          Contains:                   # Container<T> wiring
            Antennas:
              - Name: Ant1
                Type: Antenna
          References:                 # Reference<T> wiring
            Peer: RadarSim.Radar2.Ant1   # absolute dotted instance-path
        - Name: Radar2                # a second root on the same site
          Type: RadarModel
    - Name: Beta
      Models:
        - Name: Tracker1
          Type: TrackerModel
```

Key rules:

- **Explicit `Sites:`.** A model is a *root* only by appearing under a site's
  `Models:`; sub-models appear *only* under `Contains:`. The two positions are
  structurally distinct — no ambiguity about whether a sub-model has a site, and
  no "missing site" case. (An earlier optional per-model `Site:` label was
  rejected for exactly that ambiguity.)
- **Explicit `Name:` + `Type:`** on every node.
- **`Contains:` / `References:`** are the two association blocks; `Config:` /
  `Dependencies:` configure construction. All four recurse at every depth.
- **Cardinality is sugar:** a single mapping under a `Contains`/`References` key
  means a collection of one; a sequence means N. The runtime type is always the
  collection.
- **Addressing ⊥ placement.** Reference paths (`Simulator.Model.SubModel…`)
  address instances by name through the containment tree; the **site never
  appears in a path**. Full dotted paths must be unique.

---

## 6. Codegen ↔ Assembly bridge *(next design topic)*

For a model `Type`, the generator is expected to emit: a strongly-typed `Config`
record (giving schema/validation over the YAML's weak typing); a constructor
taking its `Config`, `Dependencies`, and owning site; backing `Container<T>`
fields populated from `Contains:`; `Reference<T>` fields resolved from
`References:` by path; the `<Type>Ref` smart-accessor class; and `[Observable]`
member plumbing for the MMI stream. This is the next area to work out in detail.

---

## Open questions

- Reference-path grammar: is the leading `Simulator` name mandatory (future-proofs
  cross-assembly references) or elidable within one file?
- How an `await` on a cross-site `ValueTask` interacts with a running
  `IEnumerator<SimYield>` process (does the process suspend on the scheduler
  until the inject completes?).
- The full attribute vocabulary (`[Observable]`, `[Process]`, `[Periodic]`, …).
- Single-cardinality association forms vs always-list.
