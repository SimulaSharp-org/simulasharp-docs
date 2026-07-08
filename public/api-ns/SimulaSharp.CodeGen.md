The Roslyn incremental source generators (an analyzer — not referenced at runtime). They turn annotated models + the YAML assembly into wiring:

- `SimulatorGenerator` — the `<Name>Simulator` from `*.simassembly.yaml`, with strict `SIM001`–`SIM015` validation. See [the assembly](#/guide/the-assembly) and [the YAML reference](#/guide/assembly-yaml-reference).
- `KnobGenerator` / `PlottableGenerator` (`SIM020`) — the observability binders. See [observability](#/guide/observability).
- `ConfigGenerator` — `__ApplyConfig`. `RefGenerator` / `ReferenceAccessorGenerator` — the `<Type>Ref` accessors. `ServiceGenerator` — the service plumbing.
