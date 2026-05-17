param(
  [ValidateSet("low", "balanced", "high", "cinematic")]
  [string]$Quality = "cinematic",

  [ValidateRange(0, 240)]
  [int]$Fps = 60,

  [string]$Theme = "nebula",

  [ValidateRange(0.5, 3.0)]
  [double]$PixelRatio = 1.35
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
$buildDir = Join-Path $root "live-wallpaper"
$packagesDir = Join-Path $root "packages"
$stageDir = Join-Path $packagesDir "_PurplePlanet"
$zipPath = Join-Path $packagesDir "PurplePlanet.zip"
$livelyPath = Join-Path $packagesDir "PurplePlanet.lively"

Set-Location $root

if (-not (Test-Path -LiteralPath (Join-Path $root "node_modules"))) {
  Write-Host "Installing npm dependencies..."
  & npm install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install failed. Install dependencies manually, then rerun this script."
  }
}

$vitePath = Join-Path $root "node_modules\vite\bin\vite.js"
if (-not (Test-Path -LiteralPath $vitePath)) {
  throw "Could not find local Vite at $vitePath. Run npm install first."
}

Write-Host "Building PurplePlanet static wallpaper..."
& node $vitePath build --base ./ --outDir live-wallpaper --emptyOutDir=true
if ($LASTEXITCODE -ne 0) {
  throw "Vite build failed."
}

New-Item -ItemType Directory -Path $packagesDir -Force | Out-Null

if (Test-Path -LiteralPath $stageDir) {
  Remove-Item -LiteralPath $stageDir -Recurse -Force
}

New-Item -ItemType Directory -Path $stageDir | Out-Null
Copy-Item -Path (Join-Path $buildDir "*") -Destination $stageDir -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root "LICENSE") -Destination $stageDir -Force

$query = "quality=$Quality&fps=$Fps&theme=$Theme&pixelRatio=$PixelRatio"
$launcher = @"
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="0; url=./index.html?$query">
    <title>PurplePlanet</title>
  </head>
  <body>
    <script>
      location.replace("./index.html?$query");
    </script>
  </body>
</html>
"@

Set-Content -LiteralPath (Join-Path $stageDir "wallpaper.html") -Value $launcher -Encoding UTF8

$metadata = [ordered]@{
  AppVersion = "2.2.1.0"
  Title = "PurplePlanet"
  Desc = "Colorful lightweight Three.js orbital planet live wallpaper."
  Author = "Neko Legends (@softpoo)"
  License = "MIT"
  Contact = "https://nekolegends.com"
  Type = 2
  FileName = "wallpaper.html"
  Arguments = $null
  IsAbsolutePath = $false
}

$metadata |
  ConvertTo-Json -Depth 4 |
  Set-Content -LiteralPath (Join-Path $stageDir "LivelyInfo.json") -Encoding UTF8

$installNotes = @"
PurplePlanet

Lively Wallpaper:
1. Open Lively.
2. Drag PurplePlanet.lively or PurplePlanet.zip into the Lively window.
3. In Lively Settings, enable Start with Windows.
4. For the mixed 3-monitor setup, use the Span layout if you want one continuous wallpaper across all displays.

Wallpaper Engine:
1. Open Wallpaper Engine Editor.
2. Create a web wallpaper from the generated live-wallpaper/index.html folder.
3. Enable automatic startup in Wallpaper Engine settings.

Default package launch parameters:
$query
"@

Set-Content -LiteralPath (Join-Path $stageDir "README-install.txt") -Value $installNotes -Encoding UTF8

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
if (Test-Path -LiteralPath $livelyPath) {
  Remove-Item -LiteralPath $livelyPath -Force
}

Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -Force
Copy-Item -LiteralPath $zipPath -Destination $livelyPath -Force
Remove-Item -LiteralPath $stageDir -Recurse -Force

Write-Host ""
Write-Host "Built wallpaper folder:"
Write-Host "  $buildDir"
Write-Host "Lively package:"
Write-Host "  $livelyPath"
Write-Host "Zip package:"
Write-Host "  $zipPath"
