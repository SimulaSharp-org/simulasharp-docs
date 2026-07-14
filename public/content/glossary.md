# Glossary

The vocabulary of SimulaSharp, alphabetical. Each entry links to the chapter that covers it in depth.

| Term | Definition |
|---|---|
| **actor** | The concurrency unit: an independent scheduling domain with its own thread and no shared state. In SimulaSharp an actor is a **SimSite**. See [SimSites & actors](#/guide/simsites-and-actors). |
| **assembly** | The YAML file that names the sites, services, and model tree and wires them together; the generator turns it into the `<Name>Simulator`. See [the assembly](#/guide/the-assembly) and the [YAML reference](#/guide/assembly-yaml-reference). |
| **caller-site dispatch** | The generated `<Type>Ref` accessor's behaviour: a call from the same site runs directly (lock-free); a cross-site call is marshalled onto the target's thread. See [associations](#/guide/associations). |
| **collectible ALC** | A collectible `AssemblyLoadContext` — the .NET mechanism the host uses to load a packed simulator and later **unload/reload** it without restarting. See [packing & hosting](#/guide/packing-and-hosting). |
| **config** | An assembly-supplied value bound into a `[Parameter]` member before `Configure()` runs. See [configuration](#/guide/configuration). |
| **`Container<T>`** | The read-only accessor for **ownership** (containment): a parent's list of owned children of type `T`, declared with `[Contains<T>("Name")]` and filled from the YAML `Models` block. See [models & containment](#/guide/models-and-containment). |
| **containment** | The ownership relation between a parent model and the children it owns; the whole subtree shares the parent's site. See [models & containment](#/guide/models-and-containment). |
| **coroutine** | A model's long-running behaviour written as an `IEnumerator<SimYield>` that `yield`s to advance simulated time — SIMULA's "process" abstraction. See [coroutines](#/guide/coroutines). |
| **event queue** | A SimSite's per-site queue of due work, drained each spin; tested synchronously via `ProcessDue(nowUs)`. See [event queue & scheduling](#/guide/event-queue-and-scheduling). |
| **horizon** | The single 64-bit number the clock publishes: elapsed simulation time in microseconds. One writer (the clock thread), many readers (the sites). See [time & the clock](#/guide/time-and-clock). |
| **hosting** | Loading a packed simulator into a collectible context and running/observing/reloading it — the **Hosting** library, ultimately the MMI. See [packing & hosting](#/guide/packing-and-hosting). |
| **knob** | The unit of observation and control: a named readable/settable value or a trigger, marked with a `[*Knob]` attribute and streamed to a UI. See [observability](#/guide/observability). |
| **lifecycle states** | The strict progression `Initialized → Configured → Running` (the constructor assembles, landing in `Initialized`); `Stop()` freezes without leaving `Running`; single-use (no reset). See [simulator lifecycle](#/guide/simulator-lifecycle). |
| **marshalling** | Handing work across a site boundary: the caller drops a message into the target site's lock-free inbox, which runs it on *its* thread. See [SimSites & actors](#/guide/simsites-and-actors). |
| **mission epoch** | The fixed absolute instant mission time counts from — the assembly's `MissionStart`, default the Unix epoch. See [time & the clock](#/guide/time-and-clock). |
| **mission time** | Absolute wall-clock instant of the simulation: `mission epoch + horizon`, read as `MissionNowUs`. See [time & the clock](#/guide/time-and-clock). |
| **model** | A component you author (deriving `ModelBase`) with state and behaviour; the node type in the tree. See [models & containment](#/guide/models-and-containment) and [model vs service](#/guide/model-vs-service). |
| **`<Name>Simulator`** | The generated `SimulatorBase` subclass (from `Simulator.Name`) that constructs and wires everything; an `ISimulator`. See [simulator lifecycle](#/guide/simulator-lifecycle). |
| **pack (`.nupkg`)** | A finished simulator packaged via `dotnet pack`, made self-contained (private deps + `deps.json`) for a host to load. See [packing & hosting](#/guide/packing-and-hosting). |
| **plottable** | The unit of plot telemetry: a named numeric sample the host sweeps at one mission-time stamp per sweep. Marked `[Plottable]`. See [observability](#/guide/observability). |
| **reference** | A non-owning link from one model to another (possibly on another site). See [associations](#/guide/associations). |
| **`[Reference<T>]`** | The decorator for an **intra-site** non-owning link; the generator emits a read-only `IReadOnlyList<T>` of the same-site target instances (direct, no `Ref`), filled from the YAML `Refs` block. See [associations](#/guide/associations). |
| **`[CrossReference<T>]`** | The decorator for a **cross-site** non-owning link (`T` must be an interface); the generator emits a read-only `IReference<T Ref>` of guarded `Ref`s that capture both schedulers, filled from the YAML `CRefs` block. Members route by tier: `[Triggerable]` (notify), `[VolatileAccess]` (gauge), default (ask). See [associations](#/guide/associations). |
| **service** | A shared capability with its own thread, exposing generated pub/sub events and request entry points; not part of the model tree. See [services](#/guide/services). |
| **sim time** | Elapsed simulation time in microseconds — the horizon, read as `SimNowUs`; starts at 0. See [time & the clock](#/guide/time-and-clock). |
| **SimClock** | The single hard-real-time clock: one writer thread advancing the horizon at 1:1 with wall time; `Start`/`Pause`, no reset. See [time & the clock](#/guide/time-and-clock). |
| **SimSite** | An independent scheduling domain — one thread, one event queue — that runs a subtree of models lock-free. Parallelism comes from having several. See [SimSites & actors](#/guide/simsites-and-actors). |
| **SimYield** | The value a coroutine yields to schedule its next resumption (e.g. delay a span). See [coroutines](#/guide/coroutines). |
| **`<Type>Ref`** | A generated smart accessor for a reference/association that applies caller-site dispatch. See [associations](#/guide/associations). |
