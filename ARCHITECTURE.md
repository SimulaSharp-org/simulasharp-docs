# SimulaSharp — Architecture

**SimulaSharp** is a C# simulation kernel targeting **.NET 10**. It combines a
**real-time clock** with a **discrete-event scheduler**, and models subsystems as
independent parallel actors. The name is a nod to **SIMULA**, the language that
introduced coroutine-based process modelling — echoed here by the `SimYield`
primitive and `IEnumerator<SimYield>` coroutines.

Assembly: `SimulaSharp.Kernel` · Root namespace: `SimulaSharp.Kernel`

> This document covers the **kernel internals**. For the wider effort — the
> authoring model, associations, the YAML Assembly format, and the codegen/MMI
> roadmap — see [DESIGN.md](./DESIGN.md).

---

## Big picture

```
        ┌──────────────┐   Tick(TimeContext)  ┌──────────────────────────┐
        │  WallClock   │ ───────────────────► │ SimSite "A"  (own thread)│
        │ (bg thread,  │                      │  horizon := ctx.SimTimeUs│
        │  Stopwatch,  │ ───────────────────► │  wake → drain inbox      │
        │  SpeedFactor)│           │          │  → EventQueue.Process    │
        └──────────────┘           │          │        Until(horizon)    │
                                   │          └──────────────────────────┘
                                   └────────► ┌──────────────────────────┐
                                              │ SimSite "B"  (own thread)│
                                              └──────────────────────────┘
     cross-site messages: Post / InjectAsync ──► target site's lock-free inbox
```

The clock advances simulated time and **publishes a horizon**; it never runs
user work itself. Each `SimSite` runs on its own thread and processes its own
event queue up to that horizon, single-threaded. Parallelism comes from having
many sites; correctness comes from message passing rather than shared state.

---

## Components

### Primitives (`Kernel/Primitives/`)

**`TimeContext`** — a `readonly struct` time snapshot. Carries `SimTimeUs`
(simulation-local microseconds) and `MissionTimeUs` (absolute epoch µs). The
nested `TimeContext.Factory(DateTime missionStart)` precomputes the epoch offset
once, so stamping an event with `factory.At(us)` is a single `long` addition —
no `DateTime` arithmetic on the hot path.

**`SimYield`** — a `readonly struct` yield token returned by coroutines:
- `SimYield.NextTick` → resume on the next processing pass (delay 0)
- `SimYield.Delay(us)` → resume after the given delay

### Services (`Kernel/Services/`)

**`IClock` / `WallClock`** — the time source. `WallClock` runs a background
thread with a `Stopwatch`, converts elapsed ticks to microseconds, scales by an
adjustable `SpeedFactor` (min `0.00001`, allowing accelerated or slowed sim),
and raises `Tick(TimeContext)`. The tick is deliberately **non-blocking**: it
only publishes the new horizon. `IClock` is an interface, so a purely logical
(non-wall-clock) clock can be added later.

**`IScheduler`** — the scheduling contract exposed to model code:
- `AddEvent(action, delayUs)` — one-shot
- `AddPeriodicEvent(action, periodUs)` — repeating
- `AddCoroutine(factory, delayUs)` — SIMULA-style process
- `RemoveEvent(id)`
- `Post(action)` — fire-and-forget cross-thread
- `InjectVoidAsync` / `InjectAsync<T>` — awaitable cross-thread

**`EventQueue`** — the core scheduler data structure (one per SimSite):
- fixed-capacity `Slot[]` + a `Queue<int>` free-list + a
  `PriorityQueue<int,long>` min-heap keyed by due-time-µs, guarded by a `Lock`
- steady-state scheduling is **allocation-free** (slots are recycled)
- a full queue makes `Add*` return `-1` (caller must handle rejection)
- `ProcessUntil(maxTimeUs, factory)` pops every event due `<= horizon`:
  - **one-shot** → run, then free the slot
  - **periodic** → run, re-enqueue at `due + period`
  - **coroutine** → `MoveNext()`, re-enqueue at `due + yield.DelayUs`, or free
    the slot when the enumerator completes
- Coroutines are **bootstrapped lazily** via a one-shot wrapper so the
  enumerator is created at execution time and sees its *scheduled* time.

**`SimSite`** — an independent subsystem, `IScheduler` + `IDisposable`. Owns a
thread and an `EventQueue`; processes events single-threaded. On `IClock.Tick`
it stores the horizon and signals an `AutoResetEvent`. Its run loop then:
1. drains a lock-free `ConcurrentQueue` **inbox** (cross-site messages), then
2. calls `EventQueue.ProcessUntil(horizon)`.

Cross-site communication (`Post` / `InjectAsync`) enqueues onto the *target*
site's inbox — no thread ever touches another site's queue directly.

---

## Key design decisions

| Decision | Why |
| --- | --- |
| Microseconds (`long`) as the universal time unit | Avoids float drift and `DateTime` math on the hot path |
| Actor-per-subsystem, single-threaded internally | Per-site logic needs no locks; parallelism via many sites |
| Clock publishes a horizon, does no work | Keeps the clock thread jitter-free |
| Pre-allocated slot array + free-list | Allocation-free steady-state scheduling |
| Coroutines see scheduled time, not creation time | Correct SIMULA-style process semantics |
| Adjustable `SpeedFactor` | Accelerated sim / slow-mo debugging |

---

## Status & TODOs (2026-07-06)

Early greenfield — core timing/scheduling is in place; the domain layer is not.

- [ ] `EventQueue.ProcessUntil` swallows exceptions (`// TODO: Log`) — add logging
- [ ] No tests yet
- [ ] No logical/virtual-time `IClock` implementation yet (interface allows it)
- [ ] `Model/` is an empty placeholder for the domain layer
