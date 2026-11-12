The author-facing base types: what you derive to write a simulation.

- [`ModelBase`](#/api/type/SimulaSharp.Kernel.Model.ModelBase) / [`IModel`](#/api/type/SimulaSharp.Kernel.Model.IModel) — a simulated entity with state and behaviour. See [Models & containment](#/guide/models-and-containment).
- [`ServiceBase`](#/api/type/SimulaSharp.Kernel.Model.ServiceBase) / [`LooselyCoupledServiceBase`](#/api/type/SimulaSharp.Kernel.Model.LooselyCoupledServiceBase) / [`IService`](#/api/type/SimulaSharp.Kernel.Model.IService) — a shared capability on its own site: sim-paced, or clock-ungated for external I/O. See [Services](#/guide/services).
- `IModelRef` / `IReferenceWiring` / `ILocalReferenceWiring` — the generated `<I>Ref` marker and the wiring hooks for cross-site and intra-site references. See [Associations](#/guide/associations).
