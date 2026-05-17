param(
  [ValidateRange(0, 86400)]
  [int]$TimeoutSeconds = 0,

  [switch]$NoOpenSettings,

  [switch]$RebuildWallpaper
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
$hostDir = Join-Path $root "PurplePlanet"
$hostInstall = Join-Path $hostDir "Install-Screensaver.ps1"
$hostConfig = Join-Path $hostDir "config.json"
$liveWallpaper = Join-Path $root "live-wallpaper"
$liveIndex = Join-Path $liveWallpaper "index.html"
$package = Join-Path $root "packages\PurplePlanet.lively"

function Require-Command($name, $message) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw $message
  }
}

function Build-Wallpaper {
  Require-Command "node" "Node.js is required to build the wallpaper. Install Node.js or use a release zip that already includes live-wallpaper/."
  Require-Command "npm" "npm is required to build the wallpaper. Install Node.js or use a release zip that already includes live-wallpaper/."

  Set-Location $root

  if (-not (Test-Path -LiteralPath (Join-Path $root "node_modules"))) {
    Write-Host "Installing web dependencies..."
    & npm install
    if ($LASTEXITCODE -ne 0) {
      throw "npm install failed."
    }
  }

  Write-Host "Building PurplePlanet wallpaper..."
  & npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "npm run build failed."
  }
}

function Resolve-WallpaperPath {
  if ($RebuildWallpaper -or -not (Test-Path -LiteralPath $liveIndex)) {
    if (-not (Test-Path -LiteralPath $package)) {
      Build-Wallpaper
    }
  }

  if (Test-Path -LiteralPath $liveIndex) {
    return $liveWallpaper
  }

  if (Test-Path -LiteralPath $package) {
    return $package
  }

  Build-Wallpaper
  if (Test-Path -LiteralPath $liveIndex) {
    return $liveWallpaper
  }

  throw "Could not find or build live-wallpaper/index.html."
}

function Update-HostConfig($wallpaperPath) {
  if (-not (Test-Path -LiteralPath $hostConfig)) {
    throw "Missing config file: $hostConfig"
  }

  $config = Get-Content -LiteralPath $hostConfig -Raw | ConvertFrom-Json
  $config.wallpaperPath = $wallpaperPath
  $config.queryString = "quality=cinematic&fps=30&pixelRatio=1.35"
  $config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $hostConfig -Encoding UTF8
}

function Register-Screensaver($screenSaverPath) {
  $desktopKey = "HKCU:\Control Panel\Desktop"
  Set-ItemProperty -Path $desktopKey -Name "SCRNSAVE.EXE" -Value $screenSaverPath
  Set-ItemProperty -Path $desktopKey -Name "ScreenSaveActive" -Value "1"

  if ($TimeoutSeconds -gt 0) {
    Set-ItemProperty -Path $desktopKey -Name "ScreenSaveTimeOut" -Value ([string]$TimeoutSeconds)
  }

  & rundll32.exe user32.dll,UpdatePerUserSystemParameters
}

if (-not (Test-Path -LiteralPath $hostInstall)) {
  throw "Missing host installer: $hostInstall"
}

$wallpaperPath = Resolve-WallpaperPath
Update-HostConfig $wallpaperPath

Write-Host "Building screensaver..."
& powershell -NoProfile -ExecutionPolicy Bypass -File $hostInstall -NoRegister
if ($LASTEXITCODE -ne 0) {
  throw "PurplePlanet screensaver build failed."
}

$screenSaverPath = Join-Path $hostDir "src\PurplePlanet\bin\Release\net9.0-windows\PurplePlanet.scr"
if (-not (Test-Path -LiteralPath $screenSaverPath)) {
  throw "Screensaver was not created: $screenSaverPath"
}

Register-Screensaver $screenSaverPath

Write-Host ""
Write-Host "Installed PurplePlanet screensaver:"
Write-Host "  $screenSaverPath"
Write-Host "Wallpaper:"
Write-Host "  $wallpaperPath"
if ($TimeoutSeconds -gt 0) {
  Write-Host "Timeout: $TimeoutSeconds seconds"
} else {
  Write-Host "Timeout: unchanged"
}

if (-not $NoOpenSettings) {
  Start-Process "rundll32.exe" -ArgumentList "shell32.dll,Control_RunDLL desk.cpl,,1"
}
