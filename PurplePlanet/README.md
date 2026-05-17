# PurplePlanet

Small live-wallpaper and screensaver host for Windows. It intentionally avoids Lively's gallery, updater, installer, alternate players, account features, and ML tools.

It loads Lively-style local wallpaper folders and `.zip` / `.lively` packages that contain `LivelyInfo.json`. Web wallpapers are served from an embedded `127.0.0.1` static server, launched in the installed Chromium browser, and attached behind desktop icons. Picture, GIF, and video assets use a small generated HTML wrapper.

The embedded static server is intentional: modern Chromium blocks Vite-built module scripts from `file://` URLs, which shows up as a plain white wallpaper. PurplePlanet does not run the Vite dev server or keep Node alive.

PurplePlanet prefers Google Chrome when it is installed. Microsoft Edge is only a fallback because Edge can show Microsoft account sync prompts on fresh browser profiles.

## Run

```powershell
.\Run-PurplePlanet.bat
```

The app creates/uses `config.json` from this folder. By default it walks up from the app folder and uses the nearest `live-wallpaper` or `packages\PurplePlanet.lively` it finds.

Useful overrides:

```powershell
.\Run-PurplePlanet.bat --wallpaper "D:\forPublic\PurplePlanet\live-wallpaper" --layout span --query "quality=cinematic&fps=30&pixelRatio=1.35"
```

To rebuild the executable after code changes:

```powershell
dotnet build PurplePlanet.sln -c Release
```

## Windows Screensaver

Build and register it as the current per-user Windows screensaver:

```powershell
.\Install-Screensaver.bat
```

Most users should double-click the root-level `Install-Screensaver.bat` instead; it also verifies the wallpaper bundle and opens Windows Screen Saver Settings.

The script builds Release, copies `PurplePlanet.exe` to `PurplePlanet.scr`, and sets this registry value:

```text
HKCU\Control Panel\Desktop\SCRNSAVE.EXE
```

The generated `.scr` lives here:

```text
src\PurplePlanet\bin\Release\net9.0-windows\PurplePlanet.scr
```

Supported screensaver switches:

- `/s` starts fullscreen screensaver mode and exits on keyboard or mouse input.
- `/c` opens `config.json`.
- `/p <hwnd>` renders inside the Windows screensaver preview pane.

Build the `.scr` without changing Windows settings:

```powershell
.\Build-Screensaver.bat
```

## Config

```json
{
  "wallpaperPath": "D:\\forPublic\\PurplePlanet\\live-wallpaper",
  "layout": "span",
  "queryString": "quality=cinematic&fps=30&pixelRatio=1.35",
  "browserExecutable": null,
  "attachToDesktop": true,
  "restartOnDisplayChange": true,
  "startupTimeoutMs": 10000
}
```

Supported `layout` values:

- `span`
- `per-monitor`

Supported Lively asset types:

- `web`
- `webaudio`
- `url`
- `picture`
- `gif`
- `video`

Application/game wallpapers are intentionally not included.
