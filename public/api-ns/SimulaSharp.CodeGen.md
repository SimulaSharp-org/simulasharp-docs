The Roslyn incremental source generators (an analyzer — not referenced at runtime). They turn annotated models + the YAML assembly into wiring, and report diagnostics `SIM001`–`SIM030`:

- `SimulatorGenerator` — the `<Name>Simulator` from `*.simassembly.yaml` (topology, services, global events), with strict validation (`SIM001`–`SIM018`, `SIM023`–`SIM028`). See [the assembly](#/guide/the-assembly) and [the YAML reference](#/guide/assembly-yaml-reference).
- `ContainmentGenerator` — the `[Contains<T>]` accessors. `LocalReferenceGenerator` — the intra-site `[Reference<T>]` lists. `ReferenceGenerator` / `RefGenerator` — the `[CrossReference<T>]` accessors and the guarded `<I>Ref` classes (`SIM019`, `SIM021`). See [associations](#/guide/associations).
- `KnobGenerator` (`SIM030`) / `PlottableGenerator` (`SIM020`) — the observability binders. See [observability](#/guide/observability).
- `ParameterGenerator` (`SIM029`) — `__ApplyParameters` and the `[Parameter]` binders. See [parameters](#/guide/configuration). `ServiceGenerator` (`SIM022`) — the service plumbing. See [services](#/guide/services).
