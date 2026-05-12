@echo off
setlocal
cd /d "%~dp0"
set "EXE=src\LivelyLite\bin\Release\net9.0-windows\LivelyLite.exe"

if exist "%EXE%" (
  "%EXE%" %*
) else (
  dotnet run --project src\LivelyLite\LivelyLite.csproj -c Release -- %*
)
