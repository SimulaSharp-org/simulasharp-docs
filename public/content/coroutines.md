# Coroutines (SimYield)

A one-shot event does a thing and returns. A periodic does a thing on a grid. But a lot of behaviour is a **process** — a
sequence of steps unfolding over simulated time: spin up, wait for pressure, open the valve, hold 200 ms, ask a peer,
wait for its answer, close. Writing that as a pile of one-shot callbacks turns your logic inside out. Writing it as a
**coroutine** lets you write it top to bottom, as a story, with `yield return` marking every point where simulated time
passes.

This is the oldest idea in the framework. The name **SimulaSharp** is a nod to **SIMULA**, the 1960s language that
introduced coroutine-based *process* modelling. A SimulaSharp coroutine *is* that abstraction, expressed with C#'s
iterator machinery.

## What a coroutine is here

A coroutine is an **`IEnumerator<SimYield>`** — an iterator method whose `yield return`s hand back a
[`SimYield`](#/api/type/SimulaSharp.Kernel.Primitives.SimYield) that says *when to resume*. You register it as a factory:

```csharp
Scheduler.AddCoroutine(Behaviour, delayUs: 0);

private IEnumerator<SimYield> Behaviour()
{
    Spinup();
    yield return SimYield.Delay(50_000);   // let 50 ms of sim time pass
    OpenValve();
    yield return SimYield.Delay(200_000);  // hold 200 ms
    CloseValve();
    // falling off the end completes the coroutine — its slot is freed
}
```

Each time the coroutine is due, the [event queue](#/guide/event-queue-and-scheduling) calls `MoveNext()` once. Your code
runs up to the next `yield return`; the `SimYield` you yield tells the queue when to call `MoveNext()` again. Between
yields, **no simulated time passes** and nothing else on the site runs — you're on the site's single thread, so a step is
atomic with respect to everything else there.

> **Key points**
> - A coroutine is `IEnumerator<SimYield>`; one `MoveNext()` per scheduled step.
> - `yield return` is where sim time advances — everything between two yields is instantaneous and uninterrupted.
> - Fall off the end (or `yield break`) and the coroutine is disposed, its slot freed.
> - It runs on the site's thread like any event: **never block it** — yield time instead of sleeping.

`AddCoroutine` returns the entry's id (the same id for every step of that coroutine), or `-1` if the site's event queue
is full. `AddCoroutineAtMission(factory, missionTimeUs)` does the same but starts the process at an absolute mission time
(`-1` if that instant is already past). Models get these on their `Scheduler`; a `ServiceBase` has them on its protected
`Scheduler` too. A `LooselyCoupledServiceBase` has no sim-time queue, so it cannot run coroutines.

## Materialized on first fire

One detail matters for timing. You pass `AddCoroutine` a **factory** (`Func<IEnumerator<SimYield>>`), not an
already-built iterator. The queue holds the factory and **only invokes it when the entry first fires** — at its scheduled
time, not at registration time:

```csharp
if (s.Factory is not null)
{
    s.Coroutine = s.Factory();   // built here, on first fire — not at AddCoroutine()
    s.Factory = null;
}
```

So the coroutine's **body doesn't start** — no field is read, no first line runs — until the delay you scheduled it with
elapses. If you `AddCoroutine(Behaviour, delayUs: 5_000)`, the very first statement of `Behaviour` runs 5 ms from now, on
a horizon that reflects *then*. This keeps deferred processes honest: a coroutine scheduled for the future captures state
at the future instant, not at scheduling time.

## The yields

`SimYield` has four factories — three timing forms plus a **bounded** await:

| Yield | Meaning | Resumes when |
|---|---|---|
| `SimYield.Immediate` | Zero delay | The **next** processing pass (due == now, so not this pass) |
| `SimYield.Delay(us)` | Wait `us` µs of sim time | The horizon reaches `resumeDue = current due + us` |
| `SimYield.Await(task)` | **Park** on a `Task` | The `task` completes (then resume on this site's thread) |
| `SimYield.Await(task, us, token)` | **Park** on a `Task`, with a timeout | The `task` completes **or** `us` µs of sim time pass — whichever first; poll `token.TimedOut` after |

`Immediate` and `Delay` re-schedule by advancing the slot's due time (`Immediate` is just `Delay(0)`); both `Await`
forms are different — they park with no time schedule (the bounded form also arms a sim-time deadline; see
[Await with a timeout](#await-with-a-timeout)). Note that `Immediate` resumes on the *next* pass, never the current
one — that's the [two-phase ProcessDue](#/guide/event-queue-and-scheduling) rule, and it's what stops a `while(true) {
yield return SimYield.Immediate; }` coroutine from starving its site: it yields the thread back every step.

```csharp
// In the EventQueue, on the Immediate/Delay branch:
s.DueTimeUs += y.DelayUs;       // push the slot's due time out (0 => next pass)
_pq.Enqueue(slot, s.DueTimeUs);
```

## Stepping through Delays

Here's how a coroutine walks through `Delay` yields, one `MoveNext()` per resumption:

```mermaid
sequenceDiagram
  participant EQ as EventQueue (site thread)
  participant CO as coroutine
  Note over EQ: due reached → first fire
  EQ->>CO: factory() then MoveNext()
  CO->>CO: Spinup()
  CO-->>EQ: yield Delay(50ms)
  Note over EQ: re-enqueue at due+50ms
  Note over EQ: horizon reaches due+50ms
  EQ->>CO: MoveNext()
  CO->>CO: OpenValve()
  CO-->>EQ: yield Delay(200ms)
  Note over EQ: re-enqueue at +200ms
  Note over EQ: horizon reaches it
  EQ->>CO: MoveNext()
  CO->>CO: CloseValve()
  CO-->>EQ: MoveNext() returns false
  Note over EQ: Dispose coroutine, free slot
```

Note the delays are **relative to the slot's current due**, not to "now". If a step's own body runs at a slightly late
horizon, the next `Delay` still measures from the *scheduled* due — the same absolute-grid discipline the periodic events
use, so a chain of delays doesn't accumulate drift. An `Await` is the exception: it re-arms the slot at the horizon when
the coroutine resumes, so after an `Await` the next `Delay` measures from that resume instant.

## Await: parking on a cross-site reply

`SimYield.Await(task)` is how a coroutine waits for something that completes on **another thread** — most often a
cross-site request that returned a `Task` from [`InjectAsync`](#/guide/simsites-and-actors). Crucially, it parks the
*coroutine*, not the *thread*: the site keeps running and serving everything else while this one process waits.

When the coroutine yields an `Await`, the queue does **not** put it back on the time-ordered priority queue. Instead it
hands the task to the site via a callback (`OnAwait`), and the site arranges the resume:

```csharp
// In the EventQueue, on the Await branch:
OnAwait?.Invoke(slot, s.Version, awaited);   // park: keep the slot, no time-schedule

// In the SimSite, wired at construction:
_events.OnAwait = (slot, version, task) =>
    task.ContinueWith(
        _ => Post(() => _events.ReArm(slot, version, _clock.SimNowUs)),
        CancellationToken.None,
        TaskContinuationOptions.ExecuteSynchronously,
        TaskScheduler.Default);
```

Read that carefully, because it's the whole mechanism:

1. The coroutine parks. Its slot stays live but is **off** the time queue — nothing will fire it on a schedule.
2. When the `task` completes (on whatever thread), the continuation `Post`s a re-arm **into this site's inbox**.
3. The site drains its inbox on its own thread and calls `ReArm(slot, version, now)`, which puts the slot back on the
   priority queue due at the **current** horizon — so it resumes on the **next pass**, on **its own thread**.
4. The `version` guard means if the slot was freed/reused while parked, the `ReArm` no-ops — a completing task can't
   resurrect a recycled slot.

```mermaid
sequenceDiagram
  participant CO as coroutine (Site A)
  participant EQ as EventQueue A
  participant IB as Site A inbox
  participant B as Site B (peer)
  CO->>B: task = peer.ReadX()  (InjectAsync → Site B)
  CO-->>EQ: yield Await(task)
  Note over EQ: park slot — no time-schedule
  Note over B: runs on B's thread, completes task
  B-->>IB: task.ContinueWith → Post(ReArm)
  Note over IB: A drains inbox on A's thread
  IB->>EQ: ReArm(slot, version, now)
  Note over EQ: re-enqueue at now → next pass
  EQ->>CO: MoveNext() — resume on A's thread
  CO->>CO: read result: task.GetAwaiter().GetResult()
```

The coroutine always resumes on **its own site's thread**, so after it wakes it can freely touch its own models with no
locking — exactly as before it parked.

### Read the result *after* resuming

Because the task is guaranteed complete by the time the coroutine resumes, you read its result **after** the `Await`, not
before — the value is sitting there ready:

```csharp
var t = peer.ReadPressure();   // Task<double> from a cross-site InjectAsync (schedulers captured at construction)
yield return SimYield.Await(t);         // park until it completes; site stays live
double pressure = t.GetAwaiter().GetResult();   // safe: complete by now, won't block
```

`GetResult()` won't block here because the coroutine only woke *because* `t` finished. (If `t` faulted, `GetResult()`
rethrows on your thread — and an unhandled throw in a coroutine step is caught by the queue, which logs it at **Error**
on the site's error channel, then drops and disposes the coroutine; see
[the event queue](#/guide/event-queue-and-scheduling).)

## Await with a timeout

An unbounded `Await` waits forever. When a reply might never come — a flaky peer, a hardware link that could stall — use
the **bounded** overload, `SimYield.Await(task, timeoutUs, token)`: it resumes on the task's completion **or** after
`timeoutUs` of *simulation* time, whichever comes first.

A coroutine receives nothing on resume (a `yield return` hands back a value; it doesn't take one), so the outcome comes
back through a caller-owned object you pass in and read after: a
[`SimAwaitToken`](#/api/type/SimulaSharp.Kernel.Primitives.SimAwaitToken). Create one, await with it, then poll
`TimedOut`:

```csharp
var tok = new SimAwaitToken();
Task<double> reading = _sensor.ReadPressure();
yield return SimYield.Await(reading, timeoutUs: 5_000, tok);   // wait ≤ 5 ms of sim time
// ── resumed here ──
if (tok.TimedOut)
{
    UseLastKnownGood();                              // the reply didn't arrive in time
}
else
{
    double p = reading.GetAwaiter().GetResult();     // completed — safe to read
    Act(p);
}
```

> **Create a fresh token per await.** The token *is* the identity of that one wait — reusing or sharing one across awaits
> breaks the resolution. Allocate it right before the `yield`.

### How the race is settled

The runtime arms **two** triggers and lets the token decide the winner — a single, one-shot resolution:

1. The **task-completion** continuation, exactly as for an unbounded await (`Post`s a re-arm into the site inbox).
2. A **sim-time deadline** — a one-shot event scheduled at `now + timeoutUs` on the site's own queue.

Whichever fires first resolves the token (`TimedOut = false` for completion, `true` for the deadline) and re-arms the
coroutine; the loser sees the token already resolved and does nothing. Both resolutions run on the **site thread** (the
deadline in `ProcessDue`, the completion via the inbox), so no lock is needed. On completion the moot deadline is
cancelled; on timeout the deadline just wins.

**The task is not cancelled on timeout.** A timed-out await leaves the underlying `Task` running — its eventual
completion is simply discarded (the token is already resolved), so you must **not** read its result after a timeout.
`token.TimedOut` is the gate that tells you whether the result is there to read. (`token.Completed` is the opposite
flag; both are `false` until the await resolves.)

The deadline takes a slot in the site's event queue. If the queue is full, the deadline cannot be armed: the site logs an
error and the await becomes **unbounded** — it resumes only when the task completes.

```mermaid
sequenceDiagram
  participant CO as coroutine (Site A)
  participant EQ as EventQueue A
  participant B as Site B (peer)
  CO-->>EQ: yield Await(task, 5ms, token)
  Note over EQ: park slot + schedule deadline at now+5ms
  alt task completes first
    B-->>EQ: ReArm (via inbox) — token → Completed
    Note over EQ: cancel the deadline
  else deadline first
    Note over EQ: deadline fires — token → TimedOut
    Note over B: task keeps running; its later result is discarded
  end
  EQ->>CO: MoveNext() — resume on A's thread
  CO->>CO: if (token.TimedOut) … else read result
```

## Coroutine vs periodic event

Both let a model act over time. Reach for the right one:

| | **Coroutine** | **Periodic event** |
|---|---|---|
| Shape | A sequence with state *between* steps | The same stateless-ish action on a grid |
| Local state | Lives in locals across yields — natural | You keep it in fields yourself |
| Timing per step | Variable — each `yield` picks its own delay | Fixed period |
| Waiting on a peer | `SimYield.Await` a `Task`, in-line | Awkward — callback into another event |
| Catch-up on lag | Resumes when due; delays are off the grid | **Bursts** missed ticks (absolute re-arm) |
| Best for | Sequences, handshakes, protocols, one-run scripts | Sampling, integration, heartbeat, control loops |

Rule of thumb: if the behaviour reads like *steps and waits*, or it needs to **await** something, use a coroutine. If it
reads like *do this every N µs, forever*, use a periodic.

## Worked example: work, wait, call a peer, await the reply

A pump controller that runs a startup sequence, then loops: read a sensor on another site, act on it, repeat every 100
ms. `Ref` accessors are the generated cross-site call surface — see [associations](#/guide/associations).

```csharp
[CrossReference<ISensor>("Sensors")]
public sealed partial class PumpController(IClock clock, IScheduler scheduler, ILogger logger)
    : ModelBase(clock, scheduler, logger)
{
    // Cross-references target an interface: [CrossReference<ISensor>] gives a generated ISensorRef accessor
    // with schedulers captured at construction (no per-call scheduler argument).
    private ISensorRef _sensor = default!;

    public override void Configure()
    {
        _sensor = Sensors[0];                      // cache the (single) referenced sensor's Ref
        // Start the process 0 µs from now (materialized on first fire).
        Scheduler.AddCoroutine(Control, delayUs: 0);
    }

    private IEnumerator<SimYield> Control()
    {
        Spinup();
        yield return SimYield.Delay(500_000);      // let hardware settle for 500 ms

        while (true)
        {
            // Cross-site request → a Task; on the same site this is a direct read.
            Task<double> reading = _sensor.ReadPressure();
            yield return SimYield.Await(reading);  // park; the site keeps serving others
            double p = reading.GetAwaiter().GetResult();   // complete by now

            if (p > Threshold) OpenRelief();
            else               CloseRelief();

            yield return SimYield.Delay(100_000);  // next sample in 100 ms
        }
    }
}
```

What to notice:

- The **startup** (`Spinup` + settle) and the **steady loop** live in one readable method, with state in locals.
- The `Await` **parks the coroutine, not the site** — every other model on this site keeps running while the reading is
  in flight.
- The reply is read **after** resuming, and resumption is back on **this** site's thread, so `OpenRelief()`/
  `CloseRelief()` touch local state lock-free.
- `while (true)` never starves anything: each iteration yields (a `Delay`, or an `Await`), handing the thread back.

## What this means for you

| You want to… | Do this |
|---|---|
| Write a multi-step, time-spanning process | `AddCoroutine(factory, delay)`; `yield return SimYield.Delay(...)` between steps |
| Yield the thread without waiting | `yield return SimYield.Immediate` (resumes next pass) |
| Wait on a cross-site reply | `var t = peer.Call(); yield return SimYield.Await(t); var r = t.GetAwaiter().GetResult();` |
| Wait on a reply, but not forever | `var tok = new SimAwaitToken(); yield return SimYield.Await(t, us, tok); if (tok.TimedOut) …` |
| Defer a process's *start* | `AddCoroutine(factory, delayUs)` — the body first runs at that delay |
| Start a process at a mission instant | `AddCoroutineAtMission(factory, missionTimeUs)` |
| End a process early | `yield break;` (or fall off the end) — it's disposed and its slot freed |
| Cancel a process from outside | `Scheduler.RemoveEvent(id)` with the id `AddCoroutine` returned — works while it waits on a `Delay`/`Immediate`, not while it is parked on an `Await`; the iterator is not disposed, so its `finally` blocks don't run |
| Do the same thing on a fixed grid | Use a [periodic event](#/guide/event-queue-and-scheduling) instead |

Coroutines close the loop on the runtime model: a [clock](#/guide/time-and-clock) publishes time,
[SimSites](#/guide/simsites-and-actors) run work on one thread each, the [event
queue](#/guide/event-queue-and-scheduling) schedules it, and coroutines let you write behaviour as processes over that
time. Next, how you actually build the model tree those processes live in: **[models &
containment](#/guide/models-and-containment)**.
