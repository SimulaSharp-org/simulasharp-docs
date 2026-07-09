# Assembly YAML reference

The **assembly** is the YAML file that names your sites, services, and the model tree, and wires them together.
The generator parses it (with YamlDotNet), validates it against your real types, and emits a
`<Name>Simulator`. This page is the exhaustive schema plus the complete `SIM001`–`SIM020` diagnostics table. For
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

  Sites:
    - Name: Main                       # site (one thread, one event queue)
      MaxEvents: 1024                  # optional; default 1024
      Models:
        - Name: Plant1                 # instance name (path segment)
          Type: Demo.Plant             # fully-qualified type (must implement IModel)
          Config: { Capacity: 5 }      # [Parameter] members, key → scalar
          Models:                      # containment: one entry per Container<T> field
            - Units:                   # <containerField>: [ child nodes ]
                - Name: UnitA
                  Type: Demo.Unit
                  Config: { Rate: 1.5 }
                  Refs:                # one entry per Reference<T> field
                    - Peers:           # <referenceField>: [ dotted instance paths ]
                        - Plant.Plant1.UnitB
                - Name: UnitB
                  Type: Demo.Unit
                  Config: { Rate: 2.5 }
          Deps:                        # one entry per [ServiceRef] member
            - Tracker: Tracker         # <serviceRefMember>: serviceName
```

The full **instance path** is the dotted chain from the simulator name down: `Plant.Plant1.UnitA`. Paths must be
unique and are what `Refs` target.

## `Simulator`

| Field | Required | Default | Meaning |
|---|---|---|---|
| `Name` | **yes** | — | The simulator's name; becomes the generated class name `<Name>Simulator` and the root path segment. |
| `MissionStart` | no | Unix epoch (UTC) | Absolute mission epoch (a date/time). `MissionNowUs = epoch + horizon`. |
| `Services` | no | *(none)* | List of shared **service** instances. |
| `Sites` | no | *(none)* | List of **SimSites**, each owning a model subtree. |

## `Services[]`

| Field | Required | Default | Meaning |
|---|---|---|---|
| `Name` | **yes** | — | Instance name; referenced from a model's or another service's `Deps`. |
| `Type` | **yes** | — | Fully-qualified type; must implement `IService` and have a `(IClock, ILogger)` ctor. |
| `Config` | no | *(none)* | Map of `[Parameter]` key → scalar for the service (optional; an omitted key uses the parameter's attribute default). |
| `Deps` | no | *(none)* | **Service→service deps.** Same shape as a model's `Deps` — a list of `{ <serviceRefMember>: serviceName }` binding a `[ServiceRef]` member to another service. Cycles are allowed (A→B and B→A): every service is constructed before any dep is bound. |

## `Sites[]`

| Field | Required | Default | Meaning |
|---|---|---|---|
| `Name` | **yes** | — | Site name. |
| `MaxEvents` | no | `1024` | Capacity of the site's event queue. |
| `Models` | no | *(none)* | The **root model nodes** owned by this site. |

## Model node

Each node describes one model instance and its subtree.

| Field | Required | Default | Meaning |
|---|---|---|---|
| `Name` | **yes** | — | Instance name; a segment of the dotted path. |
| `Type` | **yes** | — | Fully-qualified type; must implement `IModel` and have a `(IClock, IScheduler, ILogger)` ctor. |
| `Config` | no | *(none)* | Map of `[Parameter]` key → scalar (optional; an omitted key uses the parameter's attribute default, or errors if the parameter is `Required`). |
| `Models` | no | *(none)* | **Containment.** A list of `{ <containerField>: [ child nodes ] }`; each key names a `Container<T>` field on this type. |
| `Refs` | no | *(none)* | **References.** A list of `{ <referenceField>: [ dotted.paths ] }`; each key names a `Reference<T>` field, each value a target instance path. |
| `Deps` | no | *(none)* | **Service deps.** A list of `{ <serviceRefMember>: serviceName }` binding a `[ServiceRef]` member to a service instance. |

`Config` values are scalars (numbers, strings, bools) bound into `[Parameter]` members. `Models`/`Refs`/`Deps` are
lists of single-key maps so one node can populate several fields. See
**[models & containment](#/guide/models-and-containment)** and **[associations](#/guide/associations)**.

## Diagnostics — SIM001–SIM020

Every problem is a **build error** (except SIM015, a **warning**). On any error the simulator is **not emitted**,
so there is no cascade — fix the reported id and rebuild.

| ID | Meaning | Fix |
|---|---|---|
| **SIM001** | Assembly YAML parse error. | Correct the YAML syntax (indentation, mapping shape). The message carries the parser error. |
| **SIM002** | Missing `Simulator.Name`. | Add a non-empty `Name:` under `Simulator:`. |
| **SIM003** | Duplicate instance path. | Rename so every dotted instance path is unique. |
| **SIM004** | Unknown type. | The `Type` couldn't be found — use the fully-qualified name and ensure the type is referenced/compiled. |
| **SIM005** | Wrong component kind. | The type doesn't implement the expected interface — a model must be `IModel`, a service `IService`. |
| **SIM006** | Missing required constructor. | Give the type the ctor the framework calls: models `(IClock, IScheduler, ILogger)`, services `(IClock, ILogger)`. |
| **SIM007** | Invalid `Container<T>` field. | The `Models` key doesn't name a `Container<T>` field on the type — check the field name/type. |
| **SIM008** | Container element-type mismatch. | The child type isn't assignable to the container's `T` — fix the child `Type` or the container. |
| **SIM009** | Invalid `Reference<T>` field. | The `Refs` key doesn't name a `Reference<T>` field on the type — check the field name/type. |
| **SIM010** | Unresolved reference path. | The referenced instance path doesn't exist — correct the dotted path. |
| **SIM011** | Reference type mismatch. | The referenced instance isn't assignable to the reference's `T` — point at a compatible instance. |
| **SIM012** | Invalid `[ServiceRef]` dependency member. | The `Deps` key doesn't name a `[ServiceRef]` member on the type — check the member and its attribute. |
| **SIM013** | Unknown service. | The dependency names a service not declared under `Services` — add it or fix the name. |
| **SIM014** | Service type mismatch. | The named service isn't assignable to the `[ServiceRef]` member — bind a compatible service. |
| **SIM015** | Unknown config key *(warning)*. | A `Config` key has no matching `[Parameter]` member — remove it, or add/rename the member. |
| **SIM020** | Unsupported `[Plottable]` member type. | Make the plottable member a readable **numeric**, **bool**, or **enum** property. |

> IDs **SIM016–SIM019** are unassigned. SIM001–SIM015 come from the simulator generator; SIM020 from the
> plottable generator.

With a clean assembly, you have a runnable simulator — see **[Build, run & test](#/guide/build-run-test)**.
