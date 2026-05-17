@echo off
setlocal
cd /d "%~dp0"

dotnet build PurplePlanet.sln -c Release
if errorlevel 1 exit /b %errorlevel%

copy /Y "src\PurplePlanet\bin\Release\net9.0-windows\PurplePlanet.exe" "src\PurplePlanet\bin\Release\net9.0-windows\PurplePlanet.scr" >nul

echo.
echo Screensaver built:
echo   %~dp0src\PurplePlanet\bin\Release\net9.0-windows\PurplePlanet.scr
