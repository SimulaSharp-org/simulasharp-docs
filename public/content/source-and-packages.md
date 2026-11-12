# Source & packages

SimulaSharp is open source under the **MIT license**. The code lives in three repositories in the
[**SimulaSharp-org**](https://github.com/SimulaSharp-org) organization on GitHub, and the framework ships as
NuGet packages on [nuget.org](https://www.nuget.org/packages/SimulaSharp). This page is the map.

## The repositories

| Repository | What it holds |
|---|---|
| [**simulasharp-core**](https://github.com/SimulaSharp-org/simulasharp-core) | The framework: the Kernel runtime, the CodeGen source generators, Hosting, the `SimulaSharp` meta-package, and the NUnit tests. Releases and the NuGet packages come from here. |
| [**simulasharp-docs**](https://github.com/SimulaSharp-org/simulasharp-docs) | This site: the guide and the API reference, a Vite/React app published to **simulasharp.net**. |
| [**simulasharp-studio**](https://github.com/SimulaSharp-org/simulasharp-studio) | SimulaSharp.Studio, a visual design tool for models, services and topologies. It is behind the framework in development and not released yet. |

## The packages

An author references **one** package, `SimulaSharp`; the others come with it or are for hosts only. See
**[Prerequisites & install](#/guide/prerequisites)** for the install command.

| Package | What it is |
|---|---|
| [`SimulaSharp`](https://www.nuget.org/packages/SimulaSharp) | The meta-package. Reference this one: it brings in the Kernel and the CodeGen analyzer. |
| [`SimulaSharp.Kernel`](https://www.nuget.org/packages/SimulaSharp.Kernel) | The runtime: clock, sites, event queue, coroutines, services, knobs, plottables, parameters, logging. |
| [`SimulaSharp.CodeGen`](https://www.nuget.org/packages/SimulaSharp.CodeGen) | The Roslyn source generators and their diagnostics (`SIM001`–`SIM030`). |
| [`SimulaSharp.Hosting`](https://www.nuget.org/packages/SimulaSharp.Hosting) | Loads a packed simulator into a collectible load context. Only a host needs it, not an author. |

Each release is also a [GitHub release](https://github.com/SimulaSharp-org/simulasharp-core/releases) of
`simulasharp-core`, with the same packages and their symbol packages attached.

## Issues & questions

Report bugs and ideas in the issue tracker of the repository they belong to: the
[framework](https://github.com/SimulaSharp-org/simulasharp-core/issues), the
[docs](https://github.com/SimulaSharp-org/simulasharp-docs/issues), or
[Studio](https://github.com/SimulaSharp-org/simulasharp-studio/issues). For a framework bug, the smallest assembly
and model that shows it helps most.

## Contributing

All three repositories work the same way:

- Development happens on **`devel`**, through pull requests from short-lived work branches.
- **`main`** only takes merges from `devel` and always holds the latest release.
- In `simulasharp-core`, a merge into `main` publishes that version to nuget.org and creates the GitHub release; in
  `simulasharp-docs`, it deploys this site.
- Commits are small, and each one builds and passes the tests on its own.

To build the framework from source, see **[Build, run & test](#/guide/build-run-test)**.

## License

MIT, copyright (c) 2026 Andreas Michelis. The full text is in the `LICENSE` file of each repository.
