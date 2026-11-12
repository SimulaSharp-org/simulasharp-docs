# Roadmap

Where SimulaSharp is today (release **0.5.3**), and what is deferred by design. Kept honest and short.

## What exists today

| Piece | Status |
|---|---|
| **Kernel** (`SimulaSharp.Kernel`) | The runtime: the hard-real-time [`SimClock`](#/api/type/SimulaSharp.Kernel.Services.SimClock), parallel single-threaded [`SimSite`](#/guide/simsites-and-actors)s, per-site [event queues](#/guide/event-queue-and-scheduling), [coroutines](#/guide/coroutines), [associations](#/guide/associations) (`[Contains<T>]` / `[Reference<T>]` / `[CrossReference<T>]`), [services](#/guide/services) (sim-paced and loosely coupled), [global events](#/guide/events), [knobs & plottables](#/guide/observability), [parameters](#/guide/configuration), a per-site error channel, and [structured logging](#/guide/observability-design). |
| **CodeGen** (`SimulaSharp.CodeGen`) | Nine Roslyn source generators: the `<Name>Simulator`, containment and reference wiring, the guarded `<Interface>Ref` wrappers, knob/plottable/parameter binders, and service interaction surfaces — with strict build-time validation (`SIM001`–`SIM030`). |
| **Hosting** (`SimulaSharp.Hosting`) | Loads a packed simulator (`.nupkg`) into a collectible `AssemblyLoadContext`, discovers the simulators, and can unload/reload without restarting. |
| **NuGet packages** | One `SimulaSharp` meta-package (Kernel + CodeGen, with the `<SimAssembly>` build item) plus the separate `SimulaSharp.Hosting`, all MIT-licensed, built by `pack.ps1`. |
| **Test suites** | `Kernel.Tests`, `CodeGen.Tests`, and `Hosting.Tests` — real-time kernel tests, per-generator Roslyn-harness tests, and pack/load tests. |
| **This guide** | The definitive guide to *designing* a simulator: concepts, design chapters, worked scenarios, and this getting-started/reference chapter. |

Together these let you author a simulator today: write models, annotate them, describe the assembly, build (the
generators validate and emit), run through the lifecycle in real time, test, pack, and load.

## Deferred by design

These are intentionally out of scope for the current framework and this guide — not missing, just later.

- **The MMI web UI.** The operator-facing interface that binds to knobs, plots plottables, and drives the
  lifecycle is a separate product. The framework already exposes every surface it needs (an `IKnobChannel`, the
  `Plottables` sweep, log sinks, the `ISimulator` lifecycle) — but building and documenting the UI itself comes
  later. This guide covers **designing** a simulator, not **operating** one from a UI.
- **A broader operating / ops guide.** Running simulators in production — deployment, hosting top, monitoring,
  hot-reload workflows at scale — will get its own documentation once the hosting story and MMI settle.
- **Further enrichment of these docs.** More worked scenarios, deeper API cross-referencing, and expanded
  design guidance will accrete over time. The [scenarios](#/guide/scenario-satellite) and reference pages are the
  foundation, not the ceiling.

## Guiding constraint

One principle bounds the roadmap: **hard real time, compiled wiring, no runtime reflection.** Features are added
only if they preserve those commitments — the simulation *is* compiled code advancing at 1:1 with the wall clock,
and it stays that way. See **[introduction](#/guide/introduction)** and **[the big picture](#/guide/big-picture)**
for why.
