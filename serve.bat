@echo off
REM Serve the SimulaSharp docs site. Double-click, or run from a terminal.
REM First run installs npm dependencies automatically. Stop with Ctrl-C.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" %*
