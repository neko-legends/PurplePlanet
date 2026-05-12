@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\package-lively.ps1" %*
if errorlevel 1 (
  echo.
  echo PurplePlanet packaging failed.
  pause
  exit /b %errorlevel%
)

echo.
echo PurplePlanet package is ready.
pause
