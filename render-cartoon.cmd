@echo off
REM ===== Pilot investigator - CARTOON render (Windows) =====
REM Cartoon host (forward-only talking, vidstab locked) + full cartoon b-roll.
REM Usage:   render-cartoon.cmd <slug>
REM Example: render-cartoon.cmd snowtown-murders
REM Realistic version still: node tools\make-demo.mjs --slug <slug>
cd /d "%~dp0"

if "%~1"=="" (
  echo Usage:   render-cartoon.cmd ^<slug^>
  echo Example: render-cartoon.cmd snowtown-murders
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] node not found. Install Node.js: https://nodejs.org
  exit /b 1
)

REM cartoon flags: talking host forward-only / host source already cartoon / all b-roll AI cartoon
set "PILOT_HOST_PINGPONG=0"
set "PILOT_HOST_CARTOON=0"
set "PILOT_ILLUST_FIRST=1"

echo Cartoon render: %~1  (PINGPONG=0 / HOST_CARTOON=0 / ILLUST_FIRST=1; vidstab lock on)
node tools\make-demo.mjs --slug %~1
