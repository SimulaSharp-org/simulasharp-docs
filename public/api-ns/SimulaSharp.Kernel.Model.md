The author-facing base types: what you derive to write a simulation.

- [`ModelBase`](#/api/type/SimulaSharp.Kernel.Model.ModelBase) / [`IModel`](#/api/type/SimulaSharp.Kernel.Model.IModel) — a simulated entity with state and behaviour. See [Models & containment](#/guide/models-and-containment).
- [`ServiceBase`](#/api/type/SimulaSharp.Kernel.Model.ServiceBase) / [`IService`](#/api/type/SimulaSharp.Kernel.Model.IService) — a shared capability on its own thread. See [Services](#/guide/services).
- `IModelRef` / `IReferenceWiring` — the generated `<Type>Ref` marker and the wiring hook. See [Associations](#/guide/associations).
