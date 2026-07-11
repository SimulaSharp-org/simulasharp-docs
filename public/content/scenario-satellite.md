# A satellite topology

The capstone. Everything so far — containment, references, services, knobs, plottables — assembled
into the shape a **real** multi-subsystem simulator takes: a small satellite with an **EPS** (power)
subsystem, an **ADCS** (attitude) subsystem, a **Comms** subsystem, and a shared **Environment**
service. The point of this page is not new API; it is **judgement** — how you partition a system
into sites, and what you expose.

## Topology

Three model subtrees, each a root on its own site (its own thread), plus one service on its own
thread. Coloured by site; ownership edges are solid, cross-site references dotted.

```mermaid
graph TB
  subgraph eps ["SimSite 'EPS' — thread 1"]
    E["Eps"]
    B["Battery"]
    PA["Panel #0"]
    PB["Panel #1"]
    E -->|Container&lt;Battery&gt;| B
    E -->|Container&lt;Panel&gt;| PA
    E -->|Container&lt;Panel&gt;| PB
  end
  subgraph adcs ["SimSite 'ADCS' — thread 2"]
    A["Adcs"]
    W0["Wheel #0"]
    W1["Wheel #1"]
    W2["Wheel #2"]
    A -->|Container&lt;Wheel&gt;| W0
    A -->|Container&lt;Wheel&gt;| W1
    A -->|Container&lt;Wheel&gt;| W2
  end
  subgraph com ["SimSite 'Comms' — thread 3"]
    C["Comms"]
  end
  subgraph env ["Service SimSite — thread 4"]
    EN["Environment<br/><i>SunAngle, EclipseChanged</i>"]
  end

  EN -. "ServiceEvent" .-> PA
  EN -. "ServiceEvent" .-> PB
  EN -. "ServiceEvent" .-> A
  C -. "Reference&lt;Eps&gt; ⇒ marshalled" .-> E

  classDef s1 fill:#dbeafe,stroke:#2563eb,color:#1e3a8a;
  classDef s2 fill:#dcfce7,stroke:#16a34a,color:#14532d;
  classDef s3 fill:#fae8ff,stroke:#a21caf,color:#701a75;
  classDef s4 fill:#fef9c3,stroke:#ca8a04,color:#713f12;
  class E,B,PA,PB s1;
  class A,W0,W1,W2 s2;
  class C s3;
  class EN s4;
```

## The model set (elided)

The full bodies are the same integrator/subscriber/reference patterns from the earlier scenarios;
here are the shapes and what each exposes. Every model that carries a knob, plottable, config,
`[ServiceRef]`, or `Reference<T>` is **`partial`**.

```csharp
namespace Bird;

// ── EPS subtree (site 'EPS') ──────────────────────────────────────────────────
[Contains<Battery>("Batteries")]                            // owned, same site → direct calls
[Contains<Panel>("Panels")]
public partial class Eps(IClock c, IScheduler s, ILogger l) : ModelBase(c, s, l)
{
    [FloatKnob("Bus voltage", Min = 0, Max = 32, DecimalPlaces = 2, IsReadOnly = true)]
    [Plottable("Vbus", Unit = "V")]
    public partial double Vbus { get; set; }

    // Reached across sites by Comms via EpsRef.
    public double ReadStateOfCharge() => Batteries[0].ChargePct;

    public override void Configure() =>
        Scheduler.AddPeriodicEvent(Balance, periodUs: 100_000);   // sum panels − loads, drive Vbus

    private void Balance() { /* direct, lock-free calls into Batteries / Panels (same subtree) */ }
}

public partial class Battery(IClock c, IScheduler s, ILogger l) : ModelBase(c, s, l)
{
    [Parameter(1500.0)] public double CapacityWh { get; set; }
    [FloatKnob("Charge", Min = 0, Max = 100, DecimalPlaces = 1, IsReadOnly = true)]
    [Plottable("Charge", Unit = "%")]
    public partial double ChargePct { get; set; }        // integrates net power (see the integrator scenario)
}

public partial class Panel(IClock c, IScheduler s, ILogger l) : ModelBase(c, s, l)
{
    [ServiceRef] public Environment Environment { get; set; } = null!;
    [Plottable("Generated", Unit = "W")] public partial double GeneratedW { get; set; }
    // Configure(): Environment.RegisterCallback_SunAngle(Scheduler, a => GeneratedW = …);
}

// ── ADCS subtree (site 'ADCS') ────────────────────────────────────────────────
[Contains<Wheel>("Wheels")]
public partial class Adcs(IClock c, IScheduler s, ILogger l) : ModelBase(c, s, l)
{
    [ServiceRef] public Environment Environment { get; set; } = null!;   // reacts to eclipse
    [IntegerKnob("Mode", Min = 0, Max = 3)] public partial int Mode { get; set; }   // read/write
    [Plottable("Rate error", Unit = "deg/s")] public partial double RateError { get; set; }
}

public partial class Wheel(IClock c, IScheduler s, ILogger l) : ModelBase(c, s, l)
{
    [Parameter(0.02)] public double Inertia { get; set; }
    [FloatKnob("RPM", Min = -6000, Max = 6000, IsReadOnly = true)]
    [Plottable("RPM")] public partial double Rpm { get; set; }
}

// ── Comms subtree (site 'Comms') ──────────────────────────────────────────────
public partial class Comms(IClock c, IScheduler s, ILogger l) : ModelBase(c, s, l)
{
    public Reference<Eps> Power { get; } = new();        // cross-site link → EpsRef
    [TickBoxKnob("Transmit")] public partial bool Transmit { get; set; }
    // Configure(): a coroutine that Awaits Power[0].ReadStateOfCharge(Scheduler) before keying up.
}

// ── Environment service (its own site) ────────────────────────────────────────
[ServiceEvent("SunAngle", typeof(double))]
[ServiceEvent("EclipseChanged", typeof(bool))]
public partial class Environment(IClock c, ILogger l) : ServiceBase(c, l, "Environment")
{
    [ServiceRequest] protected double Handle_CurrentAngle() => /* … */ 0.0;
}
```

## The assembly

The full structure, showing every kind of node — services, nested sites, containment (`Models:`
lists of `{ containerField: [children] }`), a cross-site reference (`Refs:`), and service bindings
(`Deps:`).

```yaml
# bird.simassembly.yaml
Simulator:
  Name: Bird
  MissionStart: 2027-03-01T00:00:00      # mission epoch for MissionNowUs; default is the Unix epoch
  Services:
    - Name: Environment
      Type: Bird.Environment
  Sites:
    - Name: EPS
      MaxEvents: 2048                     # bump the queue for a busy subtree
      Models:
        - Name: Power
          Type: Bird.Eps
          Models:
            - Batteries:
                - Name: Batt0
                  Type: Bird.Battery
                  Config: { CapacityWh: 1500.0 }
            - Panels:
                - Name: PanelPX
                  Type: Bird.Panel
                  Deps: [ { Environment: Environment } ]
                - Name: PanelNX
                  Type: Bird.Panel
                  Deps: [ { Environment: Environment } ]

    - Name: ADCS
      Models:
        - Name: Attitude
          Type: Bird.Adcs
          Deps: [ { Environment: Environment } ]
          Models:
            - Wheels:
                - { Name: WheelX, Type: Bird.Wheel, Config: { Inertia: 0.02 } }
                - { Name: WheelY, Type: Bird.Wheel, Config: { Inertia: 0.02 } }
                - { Name: WheelZ, Type: Bird.Wheel, Config: { Inertia: 0.02 } }

    - Name: Comms
      Models:
        - Name: Radio
          Type: Bird.Comms
          Refs:
            - Power:
                - Bird.Power              # cross-site reference to the Eps root
```

Running it is the plain [lifecycle](#/guide/simulator-lifecycle); all four threads run in parallel:

```csharp
using var sim = new BirdSimulator();
sim.Configure();
sim.Start();
sim.Clock.RunFor(60_000_000);            // one real minute of flight
```

## Why this partition

The site boundaries *are* the design. Each choice is a threading and coupling decision:

- **EPS is one subtree** (Eps → Batteries + Panels). The power balance reads every panel and battery
  many times a step; those must be **cheap, direct, lock-free** calls, so they share a site. See
  [modeling a subsystem](#/guide/modeling-a-subsystem).
- **ADCS is a separate root.** Attitude runs a fast control loop on wheels that has *nothing* to do
  with the power balance — independent work, so give it its **own thread** and run it in parallel.
- **Comms is a third root** and links to EPS with a `Reference<Eps>`, not containment: it merely
  *asks* the power state before transmitting. That is an occasional, marshalled cross-site call — the
  right cost for a loose, infrequent coupling. Contrast with the tight EPS-internal calls above.
- **Environment is a service, not a model.** Sun angle and eclipse are shared by panels *and* ADCS,
  owned by none — the textbook case for a [service](#/guide/services). Broadcasting via
  `[ServiceEvent]` fans one update out to every subscriber's own thread.

The rule of thumb: **things that chatter share a site; things that are independent get their own;
things shared by many with a life of their own become a service.** The full reasoning is in
[choosing a topology](#/guide/choosing-a-topology).

## What to expose

- **Plottables** for anything you'd chart over time: `Vbus`, each battery's `ChargePct`, wheel
  `Rpm`, `RateError`, panel `GeneratedW`. They cost nothing until swept.
- **Read-only knobs** for live indicators the operator watches but cannot set (`Vbus`, `Charge`,
  `Rpm`).
- **Read/write knobs** for the few things an operator drives: ADCS `Mode`, Comms `Transmit`.
- **Config** for build-time constants that vary per instance: battery `CapacityWh`, wheel `Inertia`.

## What to notice

- **This is the shape a real port takes.** A subsystem tree, a couple of independent control loops on
  their own threads, a loose cross-site link, and a shared environment. Nothing here is new — it is
  the earlier scenarios composed.
- **Boundaries are your parallelism *and* your locking story.** You never write a lock; you *choose*
  a partition, and the framework serializes each site for you.
- **The generator checks the whole thing.** An unknown type, a container/element mismatch, a dangling
  `Refs:` path, a `[ServiceRef]` bound to a missing service — each is a **compile error**
  (`SIM001`–`SIM020`), not a runtime surprise.

Next: ship it — **[pack & load](#/guide/scenario-pack-and-load)**.
