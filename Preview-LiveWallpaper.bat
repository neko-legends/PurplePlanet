@echo off
setlocal

if not exist "%~dp0live-wallpaper\index.html" (
  echo Built wallpaper not found. Run Build-LiveWallpaper.bat first.
  pause
  exit /b 1
)

start "" "%~dp0live-wallpaper\index.html"
