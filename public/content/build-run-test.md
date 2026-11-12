# Build, run & test

Three things happen in a SimulaSharp project: it **builds** (and the generators validate your topology), you
**run** a generated simulator through its lifecycle, and you **test** it against the real clock in real time.

## Build

```powershell
dotnet build
```

`dotnet build` runs the source generators as part of compilation. Each `<SimAssembly>` file is parsed and
validated against your *real* types, and for every valid assembly a `<Name>Simulator` class is emitted. A wrong
topology — an unknown type, a container/element mismatch, a dangling reference, a bad event handler — or a misused
attribute — a bad `[Plottable]` member, a non-`void` `[Triggerable]` — is a **compile error**, one of
`SIM001`–`SIM030` (see the full table in the **[Assembly YAML reference](#/guide/assembly-yaml-reference)**). The one
warning is `SIM016`, a `Config:` key with no matching `[Parameter]`. When the assembly fails validation the simulator
is **not** emitted, so you never get a cascade of follow-on errors — fix the reported `SIMxxx` and rebuild.

Every model and service type must be declared `partial`, because the generators add code to it; a non-`partial` one is
`SIM029`.

To read the generated code, enable `EmitCompilerGeneratedFiles` (see
**[Project setup](#/guide/project-setup)**) and look in `Generated/`.

## Run a simulator

The generated class is an [`ISimulator`](#/api/type/SimulaSharp.Kernel.Services.ISimulator) in the **global
namespace**, with a **parameterless constructor** that assembles the whole topology. A driver (the MMI, or your own
CLI) walks it through the lifecycle:

```csharp
using var sim = new PlantSimulator();   // <Name> from Simulator.Name in the YAML; already assembled
sim.RegisterLogSink(mySink);            // any ILogSink; may be added at any time

// optional: tune parameters before Configure()
var rate = sim.GetParams().Single(p => p.Path == "Plant.Tank.FillRate");
sim.SetParam(rate, 3.0);

sim.Configure();    // run every service's, then every model's Configure()
sim.Start();        // start the sites and the clock — time begins advancing 1:1

// … observe knobs / plottables, drive it …

sim.Stop();         // freeze the horizon (resume with Start())
// Dispose (via `using`) tears it down — single-use, no reset.
```

The states advance strictly `Initialized → Configured → Running` (a constructed simulator starts already
`Initialized`). `Start()` before `Configure()` throws, and so does `SetParam(...)` after it; a second `Configure()` is a
no-op. `Stop()` freezes the run **without** leaving `Running` — check
[`IsRunning`](#/api/type/SimulaSharp.Kernel.Services.ISimulator) for the live status. See
**[Simulator lifecycle](#/guide/simulator-lifecycle)** for the full walk.

### A bounded run

Because time is **[hard real-time](#/guide/time-and-clock)** there is no run-to-completion. For a scripted run of a
known length, arm the clock to stop itself and block until it does:

```csharp
sim.Configure();
sim.Start();
sim.RunFor(200_000);   // run ~200 ms of sim time (≈200 ms wall clock), then pause
```

`ISimulator.RunFor(durationUs)` arms an auto-pause at `now + duration` and blocks the caller until that pause fires.
It takes roughly `durationUs` of *wall-clock* time — a controlled real-time run, not a fast-forward. Call `Start()`
first: `RunFor` only drives the clock, and without `Start()` the sites are never started, so time advances but no
model runs. After the pause, `Start()` resumes, or another `RunFor` runs a further span.

## Test

Testing is **real-time**, by design: there is no manual/virtual clock. Tests drive the real
[`SimClock`](#/api/type/SimulaSharp.Kernel.Services.SimClock) (through the simulator, or directly), run a short
bounded span with `RunFor`, and observe off-thread effects with a **bounded spin** rather than a fixed sleep. The suite uses **NUnit**. The pattern
(from `Kernel.Tests`):

```csharp
[Test]
public void Plant_fills_at_the_configured_rate()
{
    using var sim = new PlantSimulator();
    sim.Configure();
    sim.Start();

    sim.RunFor(100_000);   // 100 ms of real time

    // WaitUntil spins up to a timeout, returning the final value so a miss fails
    // the assertion instead of hanging — never a bare Thread.Sleep.
    Assert.That(WaitUntil(() => sim.Plottables["Plant.Tank.Level"].Sample() > 0), Is.True);
}
```

Two helpers make real-time assertions robust (see `Kernel.Tests/TestSupport.cs`):

- **`WaitUntil(condition, timeoutMs = 2000)`** — spins until the condition holds or the timeout elapses, returning the
  final value so a failure *asserts* rather than hangs.
- **`AssertElapsed(actualMs, expectedMs, tolMs)`** — asserts a measured wall-clock duration is within a
  *generous* tolerance: shared-machine real-time waits run long under load, so you assert the clock tracks real
  time to roughly 1:1, not to the microsecond.

### The event queue is tested synchronously

The one place you *don't* need the real clock is the
[event queue](#/guide/event-queue-and-scheduling): it is a pure data structure, driven synchronously by feeding it
a "now" and calling **`ProcessDue(nowUs)`** on a `new EventQueue(maxCapacity)` — no threads, no waiting. That keeps scheduling logic fast and
deterministic to test even though the surrounding system is real-time.

### The wider suite

The framework repository ships a full **NUnit** suite you can mirror:

| Project | Covers |
|---|---|
| `Kernel.Tests` | clock, SimSite, event queue, primitives, services (sim-paced and loosely coupled), global events, logging, the `SimulatorBase` lifecycle |
| `CodeGen.Tests` | each generator (simulator, events, knob, plottable, parameter, reference, service) via a Roslyn harness, plus a full pipeline compile |
| `Hosting.Tests` | packing a simulator and loading it from a `.nupkg` |

The test projects sit outside `SimulaSharp.slnx`, so run each one:

```powershell
dotnet test Kernel.Tests/Kernel.Tests.csproj
dotnet test CodeGen.Tests/CodeGen.Tests.csproj
dotnet test Hosting.Tests/Hosting.Tests.csproj
```

Next: the day-to-day rhythm — **[The dev loop](#/guide/dev-loop)**.
