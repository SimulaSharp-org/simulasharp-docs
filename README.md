# SimulaSharp — Documentation

A **Vite + React + TypeScript** documentation app: the definitive guide to **designing simulators** with
SimulaSharp, plus the generated API reference. It is a **standalone Node project that ships inside this repo** — it
is *not* a .NET project, is not part of any solution, and is invisible to `dotnet build`.

It brings together, in one tree-navigated site:

- **Guide** — the concepts (time, actors, scheduling, coroutines, models, associations, services, observability, the
  assembly, lifecycle, packing), the design chapters (topologies, interaction patterns, pitfalls), worked
  **scenarios**, getting-started, and the reference (attributes, assembly YAML, glossary).
- **API reference** — generated from the projects' XML doc comments (no separate extractor), browsable by
  assembly → namespace → type → member, with authored out-of-code namespace overviews.

It builds to static HTML/JS, so the built `dist/` can be served anywhere.

## Prerequisites

| To… | You need |
|-----|----------|
| **View / serve / build the docs** | **Node.js 18+** and npm |
| **Regenerate the API reference** | [.NET SDK 10](https://dotnet.microsoft.com/download/dotnet/10.0); the libraries build with `<GenerateDocumentationFile>` on |

Install **Node.js LTS** (includes npm) from <https://nodejs.org/en/download>.

## Serve it

```powershell
cd docs
.\serve.ps1              # Vite dev server (hot reload), http://localhost:8080, opens the browser
.\serve.ps1 -Prod       # build, then serve the production build
.\serve.ps1 -Port 8090  # different port
.\serve.ps1 -NoBrowser  # don't auto-open
```

Or double-click **`serve.bat`**. First run does `npm install` automatically. Stop with Ctrl-C.

To build the deliverable without serving: `npm install && npm run build` → static site in `dist/`.

## Layout

```
docs/
├─ index.html            # Vite entry
├─ src/                  # the React app
│  ├─ App.tsx            # shell: sidebar (Guide · API) + routes
│  ├─ Guides.tsx         # authored-markdown guide system (manifest-driven)
│  ├─ ApiViews.tsx, api.ts, useApi.ts   # API reference (parses public/api/*.xml)
│  └─ Markdown.tsx, styles.css
├─ public/
│  ├─ content/           # authored guide — manifest.json + *.md
│  ├─ api/               # collected .NET XML docs (index.json + <Assembly>.xml)
│  └─ api-ns/            # out-of-code namespace overviews (<Namespace>.md)
├─ scripts/collect-api-docs.ps1
├─ serve.ps1 / serve.bat
└─ README.md
```

- **Guide** pages are driven by `public/content/manifest.json` (ordered sections → pages). Authored markdown may
  embed ` ```mermaid ` diagrams and link to API types (`#/api/type/…`), namespaces (`#/api/ns/…`), and other guide
  pages (`#/guide/…`).
- **Namespace overviews** are authored per namespace in `public/api-ns/<Namespace>.md`.

## Regenerate the API reference

The API pages are parsed from the .NET XML doc files. To refresh them after code/doc-comment changes:

```powershell
# 1) build the libraries (they emit <Assembly>.xml because GenerateDocumentationFile is on)
dotnet build ..\core\Kernel\Kernel.csproj
dotnet build ..\core\CodeGen\SimulaSharp.CodeGen.csproj
dotnet build ..\core\Hosting\SimulaSharp.Hosting.csproj

# 2) collect the XML into the app (-CorePath defaults to the sibling ..\core)
pwsh -File scripts\collect-api-docs.ps1 -CorePath ..\core
```
