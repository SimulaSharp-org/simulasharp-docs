# Prerequisites & install

Authoring a SimulaSharp simulator needs a small, standard .NET toolchain. This page lists what to install and
how to check it. When you have the SDK and an editor, jump to **[Project setup](#/guide/project-setup)**.

## What you need

| Requirement | Version | Why |
|---|---|---|
| **.NET SDK** | **10.0** or later | The framework targets `net10.0`; the Roslyn source generators run inside `dotnet build`. |
| **OS** | **Windows** (10/11) | The repo is Windows-first; commands in this guide are PowerShell. The Kernel is portable C#, but the developer workflow is documented for Windows. |
| **A code editor** | Visual Studio 2022+, JetBrains Rider, or VS Code + C# Dev Kit | Any editor that understands `net10.0` projects and source generators. The `<SimAssembly>` item shows up as a first-class build action in VS/Rider. |
| **Git** | any recent | To clone the SimulaSharp repository (until the packages are on a feed). |

> **You do *not* need Node.js to author a simulator.** Node 18+ is only for building *this documentation site* (a
> Vite/React app). A simulator is pure C# + a YAML file.

## Check your toolchain

```powershell
dotnet --version          # expect 10.x
dotnet --list-sdks        # confirm a 10.0 SDK is present
```

If `dotnet --version` reports an older SDK, install the .NET 10 SDK and pin it for the repo with a `global.json`
if needed.

## Install the SDK

Pick whichever you prefer:

```powershell
# winget
winget install Microsoft.DotNet.SDK.10

# or Chocolatey
choco install dotnet-sdk --version=10.0.0
```

Or download the installer from the official .NET site. After installing, open a fresh terminal and re-run
`dotnet --version` to confirm.

## Get the framework

Today the Kernel and generator are consumed as **project references** from the SimulaSharp repository (a future
release ships them as the `SimulaSharp.Kernel` and `SimulaSharp.CodeGen` NuGet packages). Clone it alongside your
authoring project:

```powershell
git clone <simulasharp-repo-url>
```

You now have everything to create a project. Next: **[Project setup](#/guide/project-setup)**.
