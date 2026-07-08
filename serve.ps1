<#
.SYNOPSIS
  Serve the SimulaSharp documentation site (a Vite + React app in this folder).

.DESCRIPTION
  The docs are a standalone Vite/React/TypeScript app that ships inside the SimulaSharp repo. This wraps npm so
  you don't have to remember the commands. Node.js + npm are required (see the docs README / Prerequisites).

  Default: the Vite dev server (hot reload) - best for a quick test-run; no build step, opens the browser.
  -Prod:   build the site, then serve the built output (production preview).

.EXAMPLE
  .\serve.ps1               # dev server (hot reload) on http://localhost:8080, opens the browser
  .\serve.ps1 -Prod         # build, then preview the built site
  .\serve.ps1 -Port 8090    # different port
  .\serve.ps1 -NoBrowser    # don't auto-open the browser

  Stop with Ctrl-C.
#>
[CmdletBinding()]
param(
  [switch]$Prod,
  [int]$Port = 8080,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$site = $PSScriptRoot   # this folder IS the Vite app

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is required to build/serve the docs." -ForegroundColor Red
  Write-Host "  Install:  winget install OpenJS.NodeJS.LTS   (see the docs README / Prerequisites)" -ForegroundColor Yellow
  exit 1
}

# Call npm.cmd explicitly so $LASTEXITCODE is reliable in PowerShell.
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) { $npm = 'npm' }

Push-Location $site
try {
  if (-not (Test-Path (Join-Path $site 'node_modules'))) {
    Write-Host "Installing dependencies (first run)..." -ForegroundColor Cyan
    & $npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
  }

  $openArgs = @(); if (-not $NoBrowser) { $openArgs = @('--open') }

  if ($Prod) {
    Write-Host "Building the docs site..." -ForegroundColor Cyan
    & $npm run build
    if ($LASTEXITCODE -ne 0) { throw "build failed - fix the errors above, then re-run." }
    if (-not (Test-Path (Join-Path $site 'dist/index.html'))) { throw "build did not produce dist/ - see the output above." }
    Write-Host "Serving the built site on http://localhost:$Port ..." -ForegroundColor Green
    Write-Host "  (Ctrl-C to stop)" -ForegroundColor DarkGray
    & $npm run preview -- --port $Port --strictPort @openArgs
  }
  else {
    Write-Host "Starting the Vite dev server (hot reload) on http://localhost:$Port ..." -ForegroundColor Green
    Write-Host "  (Ctrl-C to stop.  Use -Prod to serve a production build instead.)" -ForegroundColor DarkGray
    & $npm run dev -- --port $Port --strictPort @openArgs
  }
}
finally {
  Pop-Location
}
