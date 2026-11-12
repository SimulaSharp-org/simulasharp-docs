<#
  Collect the .NET XML documentation files emitted by <GenerateDocumentationFile> into the docs app
  (public/api). The app parses these XML files at runtime to build the API reference tree — there is no
  separate extractor. Run this after building the projects, before building/serving the docs site.

  -CorePath is the root of the SimulaSharp core repo (the one holding Kernel/, CodeGen/, Hosting/). It defaults
  to a sibling checkout named "core" next to this docs repo.

  Usage:  pwsh -File scripts/collect-api-docs.ps1 [-CorePath ..\core] [-Configuration Debug]
#>
[CmdletBinding()]
param(
  [string]$CorePath = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) "core"),
  [string]$Configuration = "Debug",
  [string]$Tfm = "net10.0"
)

$ErrorActionPreference = "Stop"
$site = Split-Path $PSScriptRoot -Parent                       # the docs app root (this repo)
if (-not (Test-Path (Join-Path $CorePath "Kernel"))) {
  throw "No Kernel/ under '$CorePath' - pass -CorePath <root of the SimulaSharp core repo>"
}
$repo = (Resolve-Path $CorePath).Path                          # the core repo root
$outDir = Join-Path $site "public/api"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# (project directory, target framework, assembly name) triples whose XML docs feed the reference.
$targets = @(
  @{ Proj = "Kernel";   Tfm = "net10.0";        Asm = "SimulaSharp.Kernel" }
  @{ Proj = "CodeGen";  Tfm = "netstandard2.0"; Asm = "SimulaSharp.CodeGen" }
  @{ Proj = "Hosting";  Tfm = "net10.0";        Asm = "SimulaSharp.Hosting" }
)

# Writes text with LF line endings and no BOM, the repo's convention, whatever the OS and the compiler emitted.
function Write-Lf([string]$path, [string]$text) {
  [System.IO.File]::WriteAllText($path, ($text -replace "`r`n", "`n"), [System.Text.UTF8Encoding]::new($false))
}

$collected = @()
foreach ($t in $targets) {
  $tfm = if ($t.Tfm) { $t.Tfm } else { $Tfm }
  $xml = Join-Path $repo "$($t.Proj)/bin/$Configuration/$tfm/$($t.Asm).xml"
  if (Test-Path $xml) {
    Write-Lf (Join-Path $outDir "$($t.Asm).xml") ([System.IO.File]::ReadAllText($xml))
    # Ordered, so index.json keeps the same key order on every run and only real changes show in a diff.
    $collected += [ordered]@{ file = "$($t.Asm).xml"; name = $t.Asm }
    Write-Host "  collected $($t.Asm).xml" -ForegroundColor Green
  } else {
    Write-Host "  skip $($t.Asm) (no XML at $xml — build it with GenerateDocumentationFile on)" -ForegroundColor DarkYellow
  }
}

$index = [ordered]@{ generated = (Get-Date -Format "yyyy-MM-dd"); assemblies = $collected }
Write-Lf (Join-Path $outDir "index.json") (($index | ConvertTo-Json -Depth 5) + "`n")
Write-Host "wrote $($outDir)\index.json ($($collected.Count) assemblies)" -ForegroundColor Cyan
