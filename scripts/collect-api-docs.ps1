<#
  Collect the .NET XML documentation files emitted by <GenerateDocumentationFile> into the docs app
  (public/api). The app parses these XML files at runtime to build the API reference tree — there is no
  separate extractor. Run this after building the projects, before building/serving the docs site.

  Usage:  pwsh -File scripts/collect-api-docs.ps1 [-Configuration Debug]
#>
[CmdletBinding()]
param([string]$Configuration = "Debug", [string]$Tfm = "net10.0")

$ErrorActionPreference = "Stop"
$site = Split-Path $PSScriptRoot -Parent                       # docs (the app root)
$repo = Split-Path $site -Parent                               # SimulaSharp
$outDir = Join-Path $site "public/api"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# (project directory, target framework, assembly name) triples whose XML docs feed the reference.
$targets = @(
  @{ Proj = "Kernel";   Tfm = "net10.0";        Asm = "SimulaSharp.Kernel" }
  @{ Proj = "CodeGen";  Tfm = "netstandard2.0"; Asm = "SimulaSharp.CodeGen" }
  @{ Proj = "Hosting";  Tfm = "net10.0";        Asm = "SimulaSharp.Hosting" }
)

$collected = @()
foreach ($t in $targets) {
  $tfm = if ($t.Tfm) { $t.Tfm } else { $Tfm }
  $xml = Join-Path $repo "$($t.Proj)/bin/$Configuration/$tfm/$($t.Asm).xml"
  if (Test-Path $xml) {
    Copy-Item $xml (Join-Path $outDir "$($t.Asm).xml") -Force
    $collected += @{ name = $t.Asm; file = "$($t.Asm).xml" }
    Write-Host "  collected $($t.Asm).xml" -ForegroundColor Green
  } else {
    Write-Host "  skip $($t.Asm) (no XML at $xml — build it with GenerateDocumentationFile on)" -ForegroundColor DarkYellow
  }
}

$index = @{ generated = (Get-Date -Format "yyyy-MM-dd"); assemblies = $collected }
$index | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $outDir "index.json") -Encoding UTF8
Write-Host "wrote $($outDir)\index.json ($($collected.Count) assemblies)" -ForegroundColor Cyan
