# Attribute reference

A lookup for every authoring attribute. All live in **`SimulaSharp.Kernel.Attributes`**. The source generator
reads them at build time and emits the binding — you never write the plumbing. For the *why*, see
**[observability](#/guide/observability)** (knobs & plottables), **[configuration](#/guide/configuration)**, and
**[services](#/guide/services)**.

Members marked for a knob or a plottable are declared **`partial` properties**: the generator materializes a
volatile backing field and the get/set body. A property may carry **both** a knob attribute and `[Plottable]` —
they share the one volatile field (the knob drives observe/control, the plottable feeds graphs).

## Knobs

A **knob** is the unit of observation and control. All knob attributes derive
[`KnobAttribute`](#/api/type/SimulaSharp.Kernel.Attributes.KnobAttribute), which carries `Label` (the constructor
argument) and `IsReadOnly` — when `true` the knob is display-only (RO indicator); when `false` it is read/write
(operator *and* model can drive it). At runtime each knob has a [`KnobKind`](#/api/type/SimulaSharp.Kernel.Knobs.KnobKind)
of `Bool` / `Number` / `Text` / `Trigger`.

| Attribute | Target | Key parameters | Effect |
|---|---|---|---|
| [`TextKnobAttribute`](#/api/type/SimulaSharp.Kernel.Attributes.TextKnobAttribute) | `partial` property (string) | `MaxLength` (int, def `int.MaxValue`), `AllowEmpty` (def `true`), `AllowNewLine` (def `false`) | A text field (RW) or label (RO). `AllowNewLine` renders a text area. Kind `Text`. |
| [`TickBoxKnobAttribute`](#/api/type/SimulaSharp.Kernel.Attributes.TickBoxKnobAttribute) | `partial` property (bool) | *(label only)* | A checkbox (RW) or light indicator (RO). Kind `Bool`. |
| [`NumberKnobAttribute<T>`](#/api/type/SimulaSharp.Kernel.Attributes.NumberKnobAttribute`1) | `partial` property (numeric `T`) | `Min`/`Max` (`T`), `DecimalPlaces` (uint, def `2`; no-op for integer `T`), `KnobType` (`NumberKnobType`, def `Input`) | A numeric input/slider/rotary bounded by `Min`/`Max`, for any numeric `T` (integer or floating-point). Kind `Number`. |
| [`EnumKnobAttribute`](#/api/type/SimulaSharp.Kernel.Attributes.EnumKnobAttribute) | `partial` property (enum) | *(label only)* | A dropdown of the enum's members; the generator supplies the `Options` (underlying value + name). Kind `Enum`. Non-enum target → `SIM030`. |
| [`TriggerKnobAttribute`](#/api/type/SimulaSharp.Kernel.Attributes.TriggerKnobAttribute) | **method** `Handle_X` | *(label only)* | A button that invokes the method (RW) or a light that flashes when it fires (RO). Kind `Trigger`. |

[`NumberKnobType`](#/api/type/SimulaSharp.Kernel.Attributes.NumberKnobType) = `Input` (plain field) · `Slider`
(linear, min→max) · `Rotary` (dial, min→max).

```csharp
public partial class Pump : ModelBase
{
    [NumberKnob<float>("Setpoint", Min = 0f, Max = 100f, KnobType = NumberKnobType.Slider, DecimalPlaces = 1)]
    public partial float Setpoint { get; set; }

    [TickBoxKnob("Enabled")]
    public partial bool Enabled { get; set; }

    [TextKnob("Status", IsReadOnly = true)]
    public partial string Status { get; set; }

    [TriggerKnob("Prime")]                 // exposed as a button
    private void Handle_Prime() { /* … */ }
}
```

> The `[TriggerKnob]` targets the **`Handle_X` method** (like a service request handler), not a property.

## Plottable

The unit of *plot telemetry*: a named numeric sample the host sweeps at its own cadence.

| Attribute | Target | Parameters | Effect |
|---|---|---|---|
| [`PlottableAttribute`](#/api/type/SimulaSharp.Kernel.Attributes.PlottableAttribute) | `partial` property | `Label` (ctor arg), `Unit` (string?, e.g. `"V"`) | Registers the member in the simulator's `Plottables` map (keyed by dotted instance path); sampled via a volatile read projected to `double`. |

Supported member types: **any numeric** (`int`/`long`/`float`/`double`/…), **`bool`** (→ `1.0`/`0.0`), and
**enums** (→ underlying numeric). Anything else is a build error — **SIM020**.

```csharp
[NumberKnob<float>("Voltage", IsReadOnly = true)]  // coexists with the plottable on one field
[Plottable("Bus voltage", Unit = "V")]
public partial float Voltage { get; set; }
```

## Parameter

Declares a **build-time parameter**: a value-type member filled from this instance's `Config` block in the assembly
YAML (bound during construction), with the **default in the attribute**, and exposed per-instance via
`ISimulator.GetParams()`/`SetParam()` for override before `Configure()`. See **[parameters](#/guide/configuration)**.

| Attribute | Target | Parameters | Effect |
|---|---|---|---|
| [`ParameterAttribute`](#/api/type/SimulaSharp.Kernel.Attributes.ParameterAttribute) | settable value-type property **or** field | `default` (ctor arg — the value when the key is absent), `Key` (named, def = member name), `Required` (named, def `false`) | Binds the YAML value into the member; falls back to the default when the key is absent (or throws if `Required`). |

An unknown config key in the YAML (no matching `[Parameter]` member) is the **warning** SIM015. The assembly block is
still named `Config:`.

```csharp
[Parameter(5)]                       // default 5, key "Capacity"
public int Capacity { get; set; }

[Parameter(1.0, Key = "Rate")]       // default 1.0, custom key
public double FillRate { get; set; }

[Parameter(Required = true)]         // no default → must be supplied
public int Node { get; set; }
```

## Associations

The **class-level** decorators that declare a model's relationships. The generator emits a read-only accessor of the
given `Name` and wires it during assembly. See **[associations](#/guide/associations)**.

| Attribute | Target | Accessor | Effect |
|---|---|---|---|
| [`ContainsAttribute<T>`](#/api/type/SimulaSharp.Kernel.Attributes.ContainsAttribute`1) | **class** (repeatable) | `Container<T>` | **Owns** a same-site sub-model list (`Models:` in the YAML). Direct, synchronous access; `T` may be a class or interface. |
| [`ReferenceAttribute<T>`](#/api/type/SimulaSharp.Kernel.Attributes.ReferenceAttribute`1) | **class** (repeatable) | `IReadOnlyList<T>` | **Intra-site link** (`Refs:` in the YAML) — the target instances held directly, no `Ref`, no marshalling. Validated same-site (`SIM017`). |
| [`CrossReferenceAttribute<T>`](#/api/type/SimulaSharp.Kernel.Attributes.CrossReferenceAttribute`1) | **class** (repeatable) | `IReference<T Ref>` | **Cross-site link** (`CRefs:` in the YAML) through a generated `<I>Ref`. `T` **must be an interface** (`SIM018`). |

And the two **code-only member hints** on a cross-referenced **interface**'s members — they shape the generated `Ref`
and are invisible to tooling that reads structure:

| Attribute | Target | Ref surface | Effect |
|---|---|---|---|
| [`TriggerableAttribute`](#/api/type/SimulaSharp.Kernel.Attributes.TriggerableAttribute) | `void` interface method | `void M(…)` | **Fire-and-forget** ("notify"): same-site inline, cross-site `Post`. Must return `void` (`SIM019`). |
| [`VolatileAccessAttribute`](#/api/type/SimulaSharp.Kernel.Attributes.VolatileAccessAttribute) | get-only interface property | `T P { get; }` | **Live gauge**: a direct synchronous read, no dispatch. Must be get-only and atomically-readable (`SIM021`). |

An unmarked interface member becomes the default async request/response (`Task<T> M(…)`, or `Get`/`Set` for a property).

```csharp
public interface IPowerConsumer
{
    [Triggerable]    void OnAvailableChanged(double watts);  // notify — fire-and-forget
    [VolatileAccess] double CurrentDrawW { get; }            // gauge — direct read
    Task<string> DescribeState();                            // ask — async request/response
}

[CrossReference<IPowerConsumer>("Consumers")]                // cross-site, interface-only
[Reference<IPdm>("Pdm")]                                     // same-site, direct
public partial class Rail(IClock c, IScheduler s, ILogger l) : ModelBase(c, s, l);
```

## Services

The attributes that shape a **service**'s interaction surface. The generator owns both sides of each channel; see
**[services](#/guide/services)** and **[interaction patterns](#/guide/interaction-patterns)**.

| Attribute | Target | Parameters | Effect |
|---|---|---|---|
| [`ServiceEventAttribute`](#/api/type/SimulaSharp.Kernel.Attributes.ServiceEventAttribute) | **class** (repeatable) | `Name`, `argType` (`Type?`) | Declares a **publish point** (service → models). Emits `Trigger_<Name>(arg)` (service publishes) and `RegisterCallback_<Name>(dispatcher, callback)` (a subscriber passes its site's `IDispatcher`; delivery marshalled onto that site). Fire-and-forget, no result. |
| [`ServiceRequestAttribute`](#/api/type/SimulaSharp.Kernel.Attributes.ServiceRequestAttribute) | method `Handle_X` | `name?` (def = strip `Handle_`) | Declares an **entry point** (models → service). You write `Handle_<Name>` (≤1 arg, optional result); the generator emits the public caller that marshals onto the service's site. |
| [`ServiceRefAttribute`](#/api/type/SimulaSharp.Kernel.Attributes.ServiceRefAttribute) | settable field/property on a **model or service** | *(none)* | Marks a **service dependency**. The assembly's `Deps` block binds it by service name; the holder then calls the service's generated surface. A service may depend on a service, including **cyclically**. |

```csharp
[ServiceEvent("TargetUpdated", typeof(TrackId))]   // service → models
public sealed partial class Tracker : ServiceBase
{
    [ServiceRequest]                               // models → service, request "Register"
    private void Handle_Register(TrackId id) { /* … */ }
}

public partial class Radar : ModelBase
{
    [ServiceRef]                                   // bound by Deps in the YAML
    public Tracker Tracker { get; set; } = default!;
}
```

For how these attributes appear in the assembly (the `Services`, `Deps`, `Config` blocks), see the
**[Assembly YAML reference](#/guide/assembly-yaml-reference)**.

## Global events

The member-level attributes that plug a model or service into a **global event** — a scheduler-less, ownerless, multi-producer
pub/sub primitive. The generated simulator wires both sides at assembly time; see **[global events](#/guide/events)**.

| Attribute | Target | Parameters | Effect |
|---|---|---|---|
| [`EventHandlerAttribute`](#/api/type/SimulaSharp.Kernel.Attributes.EventHandlerAttribute) | **method** | *(none)* | Marks a **subscription target** (consumer). Must be `void` with **0 parameters** (argless event) or a **single parameter** of the payload type. The assembly's `Subscriptions` block binds it by event name; it runs on **the subscriber's own site** when the event fires. |
| [`EventReferenceAttribute`](#/api/type/SimulaSharp.Kernel.Attributes.EventReferenceAttribute) | settable field/property typed [`ISimEventInvocator`](#/api/type/SimulaSharp.Kernel.Events.ISimEventInvocator) / [`ISimEventInvocator<T>`](#/api/type/SimulaSharp.Kernel.Events.ISimEventInvocator`1) | *(none)* | Marks a **producer handle** (trigger-only — producers can't subscribe). The assembly's `Triggers` block binds it by event name; the simulator fills it with the shared event. Fire it with `Trigger()` / `Trigger(arg)`. |

```csharp
public partial class Eps : ModelBase
{
    [EventReference]                                   // producer: bound by Triggers in the YAML
    public ISimEventInvocator<double> BusFault { get; set; } = null!;
}

public partial class Heater : ModelBase, IPowerConsumer
{
    [EventHandler]                                     // consumer: bound by Subscriptions in the YAML
    public void OnBusFault(double busVoltage) { /* runs on the Heater's own site */ }
}
```

The events themselves ([`SimEvent`](#/api/type/SimulaSharp.Kernel.Events.SimEvent) /
[`SimEvent<T>`](#/api/type/SimulaSharp.Kernel.Events.SimEvent`1), or a custom
[`ISimEvent<TSub>`](#/api/type/SimulaSharp.Kernel.Events.ISimEvent`1)) are declared in the assembly's `Events:` block —
see the **[Assembly YAML reference](#/guide/assembly-yaml-reference)**.
