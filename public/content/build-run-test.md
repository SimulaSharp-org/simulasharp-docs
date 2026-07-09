# Build, run & test

Three things happen in a SimulaSharp project: it **builds** (and the generators validate your topology), you
**run** a generated simulator through its lifecycle, and you **test** it against the real clock in real time.

## Build

```powershell
dotnet build
```

`dotnet build` runs the source generators as part of compilation. Each `<SimAssembly>` file is parsed and
validated against your *real* types, and for every valid assembly a `<Name>Simulator` class is emitted. A wrong
topology — an unknown type, a container/element mismatch, a dangling reference, a bad `[Plottable]` member — is a
**compile error**, one of `SIM001`–`SIM020` (see the full table in the
**[Assembly YAML reference](#/guide/assembly-yaml-reference)**). On any error the simulator is **not** emitted, so
you never get a cascade of follow-on errors — fix the reported `SIMxxx` and rebuild.

To read the generated code, enable `EmitCompilerGeneratedFiles` (see
**[Project setup](#/guide/project-setup)**) and look in `Generated/`.

## Run a simulator

The generated class is an [`ISimulator`](#/api/type/SimulaSharp.Kernel.Services.ISimulator) with a **parameterless
constructor**. A driver (the MMI, or your own CLI) walks it through the lifecycle:

```csharp
using var sim = new PlantSimulator();   // <Name> from Simulator.Name in the YAML

sim.Configure();    // run every model's / service's Configure() depth-first
sim.Start();        // start the sites and the clock — time begins advancing 1:1

// … observe knobs / plottables, drive it …

sim.Stop();         // freeze the horizon (resume with Start())
// Dispose (via `using`) tears it down — single-use, no reset.
```

The states advance strictly `Initialized → Configured → Running` (a constructed simulator starts already `Initialized`); calling them out of order throws.
`Stop()` freezes the run **without** leaving `Running` — check
[`IsRunning`](#/api/type/SimulaSharp.Kernel.Services.ISimulator) for the live status. See
**[Simulator lifecycle](#/guide/simulator-lifecycle)** for the full walk.

### A bounded run

Because time is **[hard real-time](#/guide/time-and-clock)** there is no run-to-completion. For a scripted run of a
known length, arm the clock to stop itself and block until it does:

```csharp
sim.Configure();
sim.Clock.RunFor(200_000);   // run ~200 ms of sim time (≈200 ms wall clock), then pause
```

`RunFor(durationUs)` starts the clock if needed, arms an auto-pause at `now + duration`, and blocks the caller
until that pause fires. It takes roughly `durationUs` of *wall-clock* time — a controlled real-time run, not a
fast-forward.

## Test

Testing is **real-time**, by design: there is no manual/virtual clock. Tests drive the real
[`SimClock`](#/api/type/SimulaSharp.Kernel.Services.SimClock), run a short bounded span with `RunFor`, and observe
off-thread effects with a **bounded spin** rather than a fixed sleep. The suite uses **NUnit**. The pattern
(from `Kernel.Tests`):

```csharp
[Test]
public void Plant_fills_at_the_configured_rate()
{
    using var sim = new PlantSimulator();
    sim.Configure();

    sim.Clock.RunFor(100_000);   // 100 ms of real time

    // WaitUntil spins up to a timeout, returning the final value so a miss fails
    // the assertion instead of hanging — never a bare Thread.Sleep.
    Assert.That(WaitUntil(() => sim.Plottables["Plant.Tank.Level"].Sample() > 0), Is.True);
}
```

Two helpers make real-time assertions robust (see `Kernel.Tests/TestSupport.cs`):

- **`WaitUntil(condition, timeoutMs)`** — spins until the condition holds or the timeout elapses, returning the
  final value so a failure *asserts* rather than hangs.
- **`AssertElapsed(actualMs, expectedMs, tolMs)`** — asserts a measured wall-clock duration is within a
  *generous* tolerance: shared-machine real-time waits run long under load, so you assert the clock tracks real
  time to roughly 1:1, not to the microsecond.

### The event queue is tested synchronously

The one place you *don't* need the real clock is the
[event queue](#/guide/event-queue-and-scheduling): it is a pure data structure, driven synchronously by feeding it
a "now" and calling **`ProcessDue(nowUs)`** — no threads, no waiting. That keeps scheduling logic fast and
deterministic to test even though the surrounding system is real-time.

### The wider suite

The repository ships a full suite you can mirror:

| Project | Covers |
|---|---|
| `Kernel.Tests` | clock, SimSite, event queue, services, logging, the `SimulatorBase` lifecycle |
| `CodeGen.Tests` | each generator (simulator, knob, plottable, config, reference, service) via a Roslyn harness |
| `Hosting.Tests` | packing a simulator and loading it from a `.nupkg` |

Run them all with:

```powershell
dotnet test
```

Next: the day-to-day rhythm — **[The dev loop](#/guide/dev-loop)**.
