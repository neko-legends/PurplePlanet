# LivelyLite

Small live-wallpaper host for Windows. It intentionally avoids Lively's gallery, updater, installer, alternate players, account features, ML tools, and screensaver integration.

It loads Lively-style local wallpaper folders and `.zip` / `.lively` packages that contain `LivelyInfo.json`. Web wallpapers are served from an embedded `127.0.0.1` static server, launched in the installed Chromium browser, and attached behind desktop icons. Picture, GIF, and video assets use a small generated HTML wrapper.

The embedded static server is intentional: modern Chromium blocks Vite-built module scripts from `file://` URLs, which shows up as a plain white wallpaper. LivelyLite does not run the Vite dev server or keep Node alive.

LivelyLite prefers Google Chrome when it is installed. Microsoft Edge is only a fallback because Edge can show Microsoft account sync prompts on fresh browser profiles.

## Run

```powershell
.\Run-LivelyLite.bat
```

The app creates/uses `config.json` from this folder. By default it walks up from the app folder and uses the nearest `live-wallpaper` or `packages\PurplePlanet.lively` it finds.

Useful overrides:

```powershell
.\Run-LivelyLite.bat --wallpaper "D:\forPublic\PurplePlanet\live-wallpaper" --layout span --query "quality=balanced&fps=30&pixelRatio=1"
```

To rebuild the executable after code changes:

```powershell
dotnet build LivelyLite.sln -c Release
```

## Config

```json
{
  "wallpaperPath": "D:\\forPublic\\PurplePlanet\\live-wallpaper",
  "layout": "span",
  "queryString": "quality=balanced&fps=30&pixelRatio=1",
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
