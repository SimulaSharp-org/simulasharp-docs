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
| [`IntegerKnobAttribute`](#/api/type/SimulaSharp.Kernel.Attributes.IntegerKnobAttribute) | `partial` property (integer) | `Min`/`Max` (long), `KnobType` (`NumberKnobType`, def `Input`) | An integer input/slider/rotary bounded by `Min`/`Max`. Kind `Number`. |
| [`FloatKnobAttribute`](#/api/type/SimulaSharp.Kernel.Attributes.FloatKnobAttribute) | `partial` property (float) | `Min`/`Max` (float), `DecimalPlaces` (uint, def `2`), `KnobType` (def `Input`) | A floating-point input/slider/rotary. Kind `Number`. |
| [`TriggerKnobAttribute`](#/api/type/SimulaSharp.Kernel.Attributes.TriggerKnobAttribute) | **method** `Handle_X` | *(label only)* | A button that invokes the method (RW) or a light that flashes when it fires (RO). Kind `Trigger`. |

[`NumberKnobType`](#/api/type/SimulaSharp.Kernel.Attributes.NumberKnobType) = `Input` (plain field) · `Slider`
(linear, min→max) · `Rotary` (dial, min→max).

```csharp
public partial class Pump : ModelBase
{
    [FloatKnob("Setpoint", Min = 0f, Max = 100f, KnobType = NumberKnobType.Slider, DecimalPlaces = 1)]
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
[FloatKnob("Voltage", IsReadOnly = true)]  // coexists with the plottable on one field
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
public sealed class Tracker : ServiceBase
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
