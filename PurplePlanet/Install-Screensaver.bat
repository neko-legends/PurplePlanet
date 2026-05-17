@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Screensaver.ps1" %*
if errorlevel 1 (
  echo.
  echo PurplePlanet screensaver setup failed.
  pause
  exit /b %errorlevel%
)

echo.
echo PurplePlanet screensaver setup complete.
pause
