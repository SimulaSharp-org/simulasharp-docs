The runtime core: the clock, the scheduling domains, and the simulator base.

- [`SimClock`](#/api/type/SimulaSharp.Kernel.Services.SimClock) / [`IClock`](#/api/type/SimulaSharp.Kernel.Services.IClock) — the hard-real-time clock that publishes the horizon. See [Time & the clock](#/guide/time-and-clock).
- [`SimSite`](#/api/type/SimulaSharp.Kernel.Services.SimSite) / [`IScheduler`](#/api/type/SimulaSharp.Kernel.Services.IScheduler) — one thread + one [`EventQueue`](#/api/type/SimulaSharp.Kernel.Services.EventQueue) per scheduling domain. See [SimSites & the actor model](#/guide/simsites-and-actors) and [the event queue](#/guide/event-queue-and-scheduling).
- [`ISimulator`](#/api/type/SimulaSharp.Kernel.Services.ISimulator) / [`SimulatorBase`](#/api/type/SimulaSharp.Kernel.Services.SimulatorBase) — the control endpoint the generated `<Name>Simulator` extends. See [the lifecycle](#/guide/simulator-lifecycle).
- [`ServiceEventChannel`](#/api/type/SimulaSharp.Kernel.Services.ServiceEventChannel) — the backing for a `[ServiceEvent]`. See [Services](#/guide/services).
