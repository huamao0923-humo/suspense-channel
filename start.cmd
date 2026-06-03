@echo off
chcp 65001 >nul
REM ===== Pilot 調查員 製作工作台 一鍵啟動（Windows，雙擊即可） =====
REM 等同手動執行：node tools\serve.mjs
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [錯誤] 找不到 node。請先安裝 Node.js： https://nodejs.org
  pause
  exit /b 1
)

echo.
echo   Pilot 製作工作台 啟動中...  http://localhost:8787
echo   關閉：在本視窗按 Ctrl+C
echo.

REM 稍等伺服器起來再開瀏覽器（背景子程序，不卡住伺服器）
start "" /min cmd /c "timeout /t 2 >nul & start http://localhost:8787"

node tools\serve.mjs
pause
