@echo off
setlocal
cd /d "%~dp0"
set "EXE=src\PurplePlanet\bin\Release\net9.0-windows\PurplePlanet.exe"

if exist "%EXE%" (
  "%EXE%" %*
) else (
  dotnet run --project src\PurplePlanet\PurplePlanet.csproj -c Release -- %*
)
