# start.ps1 — Miao Channel 一鍵啟動（製作工作台 + 語音引擎預檢）
# 用法：在專案根目錄按右鍵「用 PowerShell 執行」，或終端機跑  .\start.ps1
# 關閉：本視窗按 Ctrl+C
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new()

Write-Host ''
Write-Host '  Miao Channel 製作工作台' -ForegroundColor Cyan

# 1) node 必備
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '  [錯誤] 找不到 node，請先安裝 Node.js：https://nodejs.org' -ForegroundColor Red
  Read-Host '  按 Enter 結束'; exit 1
}

# 2) 語音引擎預檢（不是常駐 server；make-demo 渲染時才會叫它，這裡只報就緒狀態）
$engine = Join-Path (Split-Path -Parent $root) 'voice-engine'
$py  = Join-Path $engine '.venv\Scripts\python.exe'
$tts = Join-Path $engine 'tts.py'
$sig = Join-Path $engine 'voices\signature\reference.wav'
if ((Test-Path $py) -and (Test-Path $tts) -and (Test-Path $sig)) {
  Write-Host '  配音引擎：VoxCPM2 簽名聲線 OK（渲染時自動啟用）' -ForegroundColor Green
} else {
  Write-Host '  配音引擎：VoxCPM2 未就緒 → 渲染將退回 Azure/WinRT' -ForegroundColor Yellow
  if (-not (Test-Path $py))  { Write-Host "    缺 venv：$py" -ForegroundColor DarkYellow }
  if (-not (Test-Path $tts)) { Write-Host "    缺 tts.py：$tts" -ForegroundColor DarkYellow }
  if (-not (Test-Path $sig)) { Write-Host "    缺簽名聲線：$sig" -ForegroundColor DarkYellow }
}

Write-Host '  工作台 → http://localhost:8787   貼圖台 → /manual.html' -ForegroundColor Cyan
Write-Host '  關閉：本視窗按 Ctrl+C' -ForegroundColor DarkGray
Write-Host ''

# 3) 背景延遲開瀏覽器（不卡住伺服器），再前景跑伺服器
Start-Job { Start-Sleep 2; Start-Process 'http://localhost:8787' } | Out-Null
node tools/serve.mjs