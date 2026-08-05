# Time & the clock

Everything in a SimulaSharp simulation is timed off one object: the
[`SimClock`](#/api/type/SimulaSharp.Kernel.Services.SimClock). Understanding it — what it does, what it deliberately
does *not* do — is the foundation for everything else.

## One writer, many readers

The clock owns a single 64-bit value, **the horizon**: elapsed simulation time in microseconds. A dedicated background
thread is the **only writer**; every SimSite is a reader. Publication is a plain `Volatile.Write`/`Volatile.Read` of a
naturally-aligned `long` — we need *visibility*, not the read-modify-write atomicity of `Interlocked`, because there is
exactly one writer.

```mermaid
sequenceDiagram
  participant SW as Stopwatch (monotonic)
  participant CT as Clock thread
  participant H as horizon (long)
  participant Site as SimSite thread
  loop while running
    CT->>SW: ElapsedTicks
    CT->>H: Volatile.Write(base + elapsedµs)
    CT->>CT: SpinWait(1)
  end
  loop while running
    Site->>H: Volatile.Read()
    Site->>Site: fire everything due ≤ horizon
  end
```

The horizon is derived from the Stopwatch's **total** elapsed ticks each iteration — not accumulated per-tick deltas —
so it carries **no truncation drift**. Over an hour it is exactly as accurate as the underlying monotonic timer.

## Hard real time: 1:1, always

Simulated time advances at **exactly the rate of real time**. There is no speed factor, no fast-forward, no
run-to-completion. If a model schedules work 100 ms ahead, that work runs after ~100 ms of *wall-clock* time. This is a
deliberate design choice: a SimulaSharp simulation is a **real-time system**, fit for hardware-in-the-loop and live
operator interaction, where "faster than real time" would be meaningless or dangerous.

> **Consequence for design.** You cannot "speed through" a long scenario. To exercise hours of behaviour you either run
> for hours, or (for tests) run short and assert on rates. See [time & determinism](#/guide/time-and-determinism).

## Read vs control: two facets of one clock

The clock is split by **capability**, so a model or service can *read and observe* time but never *control* it:

- [`IClock`](#/api/type/SimulaSharp.Kernel.Services.IClock) — the **read/observe** view: `SimNowUs`, `MissionNowUs`,
  `Now()`, `IsRunning`, the `Started`/`Stopped` events, and `SetMissionTimeProvider` (re-sources mission time — see
  below). This is what a model's `TimeKeeper` and a service's `TimeKeeper` are typed as. It has **no** `Start`/`Pause` —
  a model *cannot* freeze the simulation out from under its peers (re-sourcing mission time doesn't touch the horizon).
- [`SimClock`](#/api/type/SimulaSharp.Kernel.Services.SimClock) — the concrete clock, which **adds control**
  (`Start`/`Pause`/`PauseAtSimUs`/`RunFor`) and `IDisposable`. The **simulator owns it**; the run's driver reaches
  control through the simulator ([`ISimulator.Start`/`Stop`/`RunFor`](#/api/type/SimulaSharp.Kernel.Services.ISimulator)).

This is the same capability-segregation principle applied to sites — see [sites & dispatch](#/guide/sites-and-dispatch).

## Start, pause, resume — never reset

The clock has two control verbs and no third (on the concrete `SimClock`, driven by the simulator):

- **`Start()`** — begin (or resume) advancing. Raises `Started`.
- **`Pause()`** — freeze the horizon exactly where it is. Raises `Stopped`.

Pause/resume is seamless: on pause the clock folds the current running segment into an accumulated base and stops its
Stopwatch; on the next `Start()` it restarts the Stopwatch and keeps counting from that base. **No simulated time is
lost or invented across a pause**, however long the wall-clock gap.

```mermaid
stateDiagram-v2
  [*] --> Stopped
  Stopped --> Running: Start() — Stopwatch.Restart()
  Running --> Stopped: Pause() — fold segment into base, freeze horizon
  Running --> [*]: Dispose()
  Stopped --> [*]: Dispose()
```

There is **no reset**. A clock (and the whole simulation around it) is **single-use**: to run a scenario again from
zero, you build a new simulator. This sidesteps the genuinely hard problem — resetting every model's internal state —
by getting clean state for free from fresh instances.

## Two clocks in one: sim time and mission time

The clock exposes elapsed time and an absolute wall-clock instant, from the same horizon:

- **`SimNowUs`** — elapsed simulation microseconds (the horizon). Starts at 0.
- **`MissionNowUs`** — absolute mission time. By **default** it is a fixed **mission epoch** plus the horizon (the epoch
  set once at construction from the assembly's `MissionStart`, default the Unix epoch) — so, like sim time, it is pinned
  to real time. It can instead be **driven by a provider** (see below).

Reading them separately can *tear* — two reads may straddle a horizon advance. When you need both consistently, take a
single snapshot:

```csharp
TimeSnapshot t = clock.Now();     // one horizon read → a coherent (sim, mission) pair
// default source: t.MissionTimeUs == epoch + t.SimTimeUs; with a provider, both are sampled together (see below)
```

[`TimeSnapshot`](#/api/type/SimulaSharp.Kernel.Primitives.TimeSnapshot) is what the logging layer and the plottable
sweep use so every stamped record is internally consistent.

### Mission time can be provider-driven

Mission time is the one clock you can **re-source at runtime**. A component installs an
[`IMissionTimeProvider`](#/api/type/SimulaSharp.Kernel.Services.IMissionTimeProvider) via
[`IClock.SetMissionTimeProvider`](#/api/type/SimulaSharp.Kernel.Services.IClock), and from then on `MissionNowUs` (and
the mission field of `Now()`) return **that** provider's value instead of `epoch + horizon`. Pass `null` to revert to
the default.

This exists because mission time and *real* time aren't always the same. Sim time is hard 1:1 and never warps — but a
mission clock might be **fast-forwarded between events**, e.g. an FES / HIL rig that skips ahead between ground-station
passes. Installing that rig's clock as the provider makes every component's mission time — uptime counters, RTCs,
mission-stamped telemetry — track the *mission* rather than the wall clock, with **no model changes**: models keep
reading `MissionNowUs` off the `IClock` they already hold.

```csharp
// inside the authority service (e.g. an FES service), once its clock is ready:
public override void Configure() => TimeKeeper.SetMissionTimeProvider(_fesClock);   // _fesClock : IMissionTimeProvider
```

The provider's `MissionNowUs` is read **cross-thread** on every mission-time access (any site, plus the plot sweep), so
it must be cheap and non-blocking — typically a `Volatile.Read` of a value the authority keeps current (optionally
interpolated from `SimNowUs`). One consequence: with a provider installed, **sim and mission become independent clocks** —
`Now()` still returns a coherent snapshot of both, but mission is no longer `epoch + sim`.

## Bounded runs: `RunFor` and `PauseAtSimUs`

For scripted runs and tests, the clock can **stop itself** at a target horizon. This is *not* a fast-forward — time
still advances at 1:1 — it is a clean, automatic boundary.

- **`PauseAtSimUs(target)`** — arm an auto-pause: when the horizon reaches `target`, the clock thread pauses itself.
  A manual `Pause()` disarms it (a freeze is never silently re-armed); pass a negative value to disarm.
- **`RunFor(durationUs)`** — arm `now + duration`, ensure the clock is started, and **block the caller** until the
  pause fires. It takes ~`durationUs` of real time — a controlled real-time run.

```mermaid
sequenceDiagram
  participant Caller
  participant Clock as Clock thread
  Caller->>Clock: RunFor(200_000)  (arm pauseAt = now+200ms, Start)
  activate Clock
  loop advancing
    Clock->>Clock: horizon += elapsed
    Note over Clock: horizon ≥ target?
  end
  Clock-->>Caller: horizon hit target → Pause() → unblock
  deactivate Clock
  Note over Caller: ~200 ms later, clock paused at ~200 ms
```

Because the **clock thread itself** performs the auto-pause, the caller never races the horizon writer. Overshoot is
bounded by the spin granularity (sub-microsecond to a few µs).

## What this means for you

| You want to… | Use |
|---|---|
| Read "what time is it now?" inside a model | `Clock.SimNowUs` (or `TimeKeeper.SimNowUs` on `ModelBase`) |
| Stamp an event with wall-clock/mission time | `Clock.MissionNowUs`, or `Clock.Now()` for a consistent pair |
| Drive mission time from an external / fast-forwarded clock | install an `IMissionTimeProvider` via `Clock.SetMissionTimeProvider(...)` |
| Start / freeze / resume a run | `Start()` / `Pause()` on the simulator (which drives the clock) |
| Run for a bounded span then stop (scripts, tests) | `RunFor(durationUs)` |
| Run a scenario again | build a **new** simulator (no reset) |

Models never *advance* time — they only *read* it and schedule work relative to it. How that scheduling works is the
next chapter: **[SimSites & the actor model](#/guide/simsites-and-actors)**.
