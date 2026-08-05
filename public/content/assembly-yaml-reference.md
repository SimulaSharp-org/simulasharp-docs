# Assembly YAML reference

The **assembly** is the YAML file that names your sites, services, and the model tree, and wires them together.
The generator parses it (with YamlDotNet), validates it against your real types, and emits a
`<Name>Simulator`. This page is the exhaustive schema plus the complete `SIM001`–`SIM030` diagnostics table. For
the concepts, read **[the assembly](#/guide/the-assembly)**.

Register the file by tagging it `<SimAssembly Include="…" />` in your csproj (any name — the `.simassembly.yaml`
suffix is only a convention) — see **[Project setup](#/guide/project-setup)**.

## Annotated example

```yaml
Simulator:
  Name: Plant                          # required → generates class PlantSimulator
  MissionStart: 2026-01-01T00:00:00    # optional; default = Unix epoch (UTC)

  Services:
    - Name: Tracker                    # instance name (referenced by Deps)
      Type: Demo.DemoService           # fully-qualified type (must implement IService)
      # Config: { … }                  # optional [Parameter] values for the service

  Events:
    - Name: BusFault                   # global event name (referenced by Triggers/Subscriptions)
      ArgType: System.Double           # optional payload type; omit → an argless SimEvent
      # Type: Demo.RoutingEvent        # optional custom ISimEvent<…>; default SimEvent / SimEvent<ArgType>

  Sites:
    - Name: Main                       # site (one thread, one event queue)
      MaxEvents: 64                    # optional; default 64
      Models:
        - Name: Plant1                 # instance name (path segment)
          Type: Demo.Plant             # fully-qualified type (must implement IModel)
          Config: { Capacity: 5 }      # [Parameter] members, key → scalar
          Models:                      # containment: one entry per [Contains<T>] container
            - Units:                   # <containerName>: [ child nodes ]
                - Name: UnitA
                  Type: Demo.Unit
                  Config: { Rate: 1.5 }
                  Refs:                # intra-site [Reference<T>] entries; use CRefs: for [CrossReference<T>]
                    - Peers:           # <referenceField>: [ dotted instance paths ]
                        - Plant.Plant1.UnitB
                - Name: UnitB
                  Type: Demo.Unit
                  Config: { Rate: 2.5 }
          Deps:                        # one entry per [ServiceRef] member
            - Tracker: Tracker         # <serviceRefMember>: serviceName
          Triggers:                    # one entry per [EventReference] producer member
            - BusFault: BusFault       # <eventReferenceMember>: eventName
          Subscriptions:               # one entry per [EventHandler] consumer method
            - OnBusFault: BusFault     # <eventHandlerMethod>: eventName
```

The full **instance path** is the dotted chain from the simulator name down: `Plant.Plant1.UnitA`. Paths must be
unique and are what `Refs` target.

## `Simulator`

| Field | Required | Default | Meaning |
|---|---|---|---|
| `Name` | **yes** | — | The simulator's name; becomes the generated class name `<Name>Simulator` and the root path segment. |
| `MissionStart` | no | Unix epoch (UTC) | Absolute mission epoch (a date/time). `MissionNowUs = epoch + horizon`. |
| `Services` | no | *(none)* | List of shared **service** instances. |
| `Events` | no | *(none)* | List of shared **global event** instances (scheduler-less pub/sub). |
| `Sites` | no | *(none)* | List of **SimSites**, each owning a model subtree. |

## `Services[]`

| Field | Required | Default | Meaning |
|---|---|---|---|
| `Name` | **yes** | — | Instance name; referenced from a model's or another service's `Deps`. |
| `Type` | **yes** | — | Fully-qualified type; must implement `IService` and have a `(IClock, ILogger)` ctor. |
| `Config` | no | *(none)* | Map of `[Parameter]` key → scalar for the service (optional; an omitted key uses the parameter's attribute default). |
| `Deps` | no | *(none)* | **Service→service deps.** Same shape as a model's `Deps` — a list of `{ <serviceRefMember>: serviceName }` binding a `[ServiceRef]` member to another service. Cycles are allowed (A→B and B→A): every service is constructed before any dep is bound. |
| `Triggers` | no | *(none)* | **Event producers.** Same shape as a model's `Triggers` — a service can hold an `[EventReference]` and fire a global event. |
| `Subscriptions` | no | *(none)* | **Event consumers.** Same shape as a model's `Subscriptions` — a service can carry an `[EventHandler]`; its handler runs on the service's own site. |

## `Events[]`

Each entry declares one **global event** — a scheduler-less, ownerless, multi-producer pub/sub primitive. Producers are
wired via a model's or service's `Triggers`, consumers via a model's or service's `Subscriptions`. See
**[global events](#/guide/events)**.

| Field | Required | Default | Meaning |
|---|---|---|---|
| `Name` | **yes** | — | Instance name; referenced from a model's `Triggers` and `Subscriptions`. |
| `ArgType` | no | *(none — argless)* | Fully-qualified payload type. Omit for an argless event (`SimEvent`); supply it for a typed event (`SimEvent<ArgType>`). |
| `Type` | no | `SimEvent` / `SimEvent<ArgType>` | Fully-qualified custom event type; must implement `ISimEvent<…>` and agree with `ArgType`. Omit for the stock, logic-free event. |

## `Sites[]`

| Field | Required | Default | Meaning |
|---|---|---|---|
| `Name` | **yes** | — | Site name. |
| `MaxEvents` | no | `64` | Capacity of the site's event queue. |
| `Models` | no | *(none)* | The **root model nodes** owned by this site. |

## Model node

Each node describes one model instance and its subtree.

| Field | Required | Default | Meaning |
|---|---|---|---|
| `Name` | **yes** | — | Instance name; a segment of the dotted path. |
| `Type` | **yes** | — | Fully-qualified type; must implement `IModel` and have a `(IClock, IScheduler, ILogger)` ctor. |
| `Config` | no | *(none)* | Map of `[Parameter]` key → scalar (optional; an omitted key uses the parameter's attribute default, or errors if the parameter is `Required`). |
| `Models` | no | *(none)* | **Containment.** A list of `{ <containerName>: [ child nodes ] }`; each key names a `[Contains<T>]` container on this type. |
| `Refs` | no | *(none)* | **Intra-site references.** A list of `{ <referenceName>: [ dotted.paths ] }`; each key names a `[Reference<T>]` (same-site) on this type, each value a target instance path. |
| `CRefs` | no | *(none)* | **Cross-site references.** A list of `{ <referenceName>: [ dotted.paths ] }`; each key names a `[CrossReference<T>]` (may cross sites) on this type, each value a target instance path. |
| `Deps` | no | *(none)* | **Service deps.** A list of `{ <serviceRefMember>: serviceName }` binding a `[ServiceRef]` member to a service instance. |
| `Triggers` | no | *(none)* | **Event producers.** A list of `{ <eventReferenceMember>: eventName }` binding an `[EventReference]` member to a global event under `Events`. |
| `Subscriptions` | no | *(none)* | **Event consumers.** A list of `{ <eventHandlerMethod>: eventName }` binding an `[EventHandler]` method to a global event under `Events`. |

`Config` values are scalars (numbers, strings, bools) bound into `[Parameter]` members.
`Models`/`Refs`/`CRefs`/`Deps`/`Triggers`/`Subscriptions` are lists of single-key maps so one node can populate several
fields. See **[models & containment](#/guide/models-and-containment)**, **[associations](#/guide/associations)**, and
**[global events](#/guide/events)**.

## Diagnostics — SIM001–SIM030

Every problem is a **build error** (except SIM016, a **warning**). On any error the simulator is **not emitted**,
so there is no cascade — fix the reported id and rebuild.

| ID | Meaning | Fix |
|---|---|---|
| **SIM001** | Assembly YAML parse error. | Correct the YAML syntax (indentation, mapping shape). The message carries the parser error. |
| **SIM002** | Missing `Simulator.Name`. | Add a non-empty `Name:` under `Simulator:`. |
| **SIM003** | Duplicate instance path. | Rename so every dotted instance path is unique. |
| **SIM004** | Unknown type. | The `Type` couldn't be found — use the fully-qualified name and ensure the type is referenced/compiled. |
| **SIM005** | Wrong component kind. | The type doesn't implement the expected interface — a model must be `IModel`, a service `IService`. |
| **SIM006** | Missing required constructor. | Give the type the ctor the framework calls: models `(IClock, IScheduler, ILogger)`, services `(IClock, ILogger)`. |
| **SIM007** | Unknown container name. | The `Models` key doesn't name a `[Contains<T>]` container on the type — check the name against the attribute. |
| **SIM008** | Container element-type mismatch. | A contained child isn't assignable to the container's `T` — fix the child `Type` or the `[Contains<T>]`. |
| **SIM009** | Contained child is not a model. | A child under `Models` doesn't implement `IModel` — only models can be contained. |
| **SIM010** | Unknown reference name. | The `Refs`/`CRefs` key doesn't name a `[Reference<T>]`/`[CrossReference<T>]` on the type — check the name and the block against the attribute. |
| **SIM011** | Unresolved reference path. | The referenced instance path doesn't exist — correct the dotted path. |
| **SIM012** | Reference type mismatch. | The referenced instance isn't assignable to the reference's `T` — point at a compatible instance. |
| **SIM013** | Invalid `[ServiceRef]` dependency member. | The `Deps` key doesn't name a `[ServiceRef]` member on the type — check the member and its attribute. |
| **SIM014** | Unknown service. | The dependency names a service not declared under `Services` — add it or fix the name. |
| **SIM015** | Service type mismatch. | The named service isn't assignable to the `[ServiceRef]` member — bind a compatible service. |
| **SIM016** | Unknown config key *(warning)*. | A `Config` key has no matching `[Parameter]` member — remove it, or add/rename the member. |
| **SIM017** | Intra-site reference crosses a site. | A `Refs` (`[Reference<T>]`) target is on a different site — move it, or use `CRefs` (`[CrossReference<T>]`) for a cross-site link. |
| **SIM018** | Cross-reference target is not an interface. | A `[CrossReference<T>]` must target an interface — introduce a capability interface for the boundary. |
| **SIM019** | `[Triggerable]` method is not `void`. | A `[Triggerable]` interface method must return `void` (fire-and-forget has no result). |
| **SIM020** | Unsupported `[Plottable]` member type. | Make the plottable member a readable **numeric**, **bool**, or **enum** property. |
| **SIM021** | `[VolatileAccess]` property is not a gauge. | A `[VolatileAccess]` interface property must be get-only and of an atomically-readable type (primitive, enum, or reference). |
| **SIM022** | Service request has more than one parameter. | A `[ServiceRequest] Handle_X` carries a single optional context — reduce it to zero or one parameter. |
| **SIM023** | Unknown event. | A `Subscriptions`/`Triggers` entry names an event not declared under `Events:` — add it or correct the name. |
| **SIM024** | Invalid event handler. | The `Subscriptions` method is missing, not `[EventHandler]`, or not `void` — mark a `void` method with `[EventHandler]`. |
| **SIM025** | Handler signature mismatch. | Wrong arity/payload — an argless event needs a 0-parameter handler; a typed event needs a single parameter the payload is assignable to. |
| **SIM026** | Wrong subscriber type. | The subscriber isn't assignable to the event's `TSub` — the stock event accepts all (`object`); a custom event's `TSub` may be narrower. |
| **SIM027** | Invalid event reference. | The `Triggers` member isn't `[EventReference]`, or isn't typed as the matching `ISimEventInvocator` / `ISimEventInvocator<T>`. |
| **SIM028** | Invalid event type. | A custom `Type` doesn't implement `ISimEvent<…>`, or disagrees with the declared `ArgType` — align the type and its argument. |
| **SIM029** | Model or service is not `partial`. | A class implementing `IModel`/`IService` must be declared `partial` so the framework can generate its parameter and wiring code — add the `partial` modifier. |
| **SIM030** | `[EnumKnob]` is not on an enum. | An `[EnumKnob]` member must be a property of an enum type — use an enum, or a different knob attribute for a non-enum value. |

> SIM001–SIM019 come from the simulator/reference generators; SIM020 from the plottable generator; SIM021 from the
> reference generator; SIM022 from the service generator; SIM023–SIM028 from the simulator generator (global-event
> wiring); SIM029 from the parameter generator (the `partial` requirement); SIM030 from the knob generator (`[EnumKnob]`
> must be an enum).

With a clean assembly, you have a runnable simulator — see **[Build, run & test](#/guide/build-run-test)**.
