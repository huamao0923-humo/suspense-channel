@echo off
chcp 65001 >nul
REM ===== Miao Channel 一鍵啟動（雙擊即可，免改執行原則） =====
REM 實際邏輯在 start.ps1（含 node 檢查、語音引擎預檢、開瀏覽器、起 serve.mjs）
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
pause
