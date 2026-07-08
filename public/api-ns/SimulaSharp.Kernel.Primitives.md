The small value types that shape a model: associations, coroutine yields, and time.

- [`Container<T>`](#/api/type/SimulaSharp.Kernel.Primitives.Container%601) — an owning containment association (shares the parent's SimSite). See [Associations](#/guide/associations).
- [`Reference<T>`](#/api/type/SimulaSharp.Kernel.Primitives.Reference%601) / [`ReferenceAccessor<T>`](#/api/type/SimulaSharp.Kernel.Primitives.ReferenceAccessor%601) — a non-owning link and its generated accessor.
- [`SimYield`](#/api/type/SimulaSharp.Kernel.Primitives.SimYield) — what a coroutine yields (`Immediate` / `Delay` / `Await`). See [Coroutines](#/guide/coroutines).
- [`TimeSnapshot`](#/api/type/SimulaSharp.Kernel.Primitives.TimeSnapshot) — a consistent sim/mission time pair. See [Time & the clock](#/guide/time-and-clock).
