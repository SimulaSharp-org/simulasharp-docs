The host-side loader, shipped as its own package `SimulaSharp.Hosting` (not part of the `SimulaSharp` meta-package). [`SimulatorPackage`](#/api/type/SimulaSharp.Hosting.SimulatorPackage) loads a packed simulator (a `.nupkg`, a build-output folder, or a `.dll`) into a collectible `AssemblyLoadContext`, discovers the simulators inside, creates one as an [`ISimulator`](#/api/type/SimulaSharp.Kernel.Services.ISimulator), and unloads for reload — the seam a hot-reloading MMI is built on.

See [Packing & hosting](#/guide/packing-and-hosting) and [Pack & load](#/guide/scenario-pack-and-load).
