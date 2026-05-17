# PurplePlanet

Lightweight Three.js orbital wallpaper for Lively Wallpaper, Wallpaper Engine, or a local browser window. It renders a fixed rim-lit planet and orbital plane while colorful light heads travel along the lanes, leaving glowing comet-like trails and particle wakes behind them.

## Run locally

```powershell
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Use as a live wallpaper

Use a real wallpaper host for daily use. A batch file can start a browser window, but it cannot attach the animation to the Windows desktop, restore it on boot, or handle monitor placement. Lively Wallpaper and Wallpaper Engine are the right layer for that.

Double-click this to build the static wallpaper bundle and Lively package:

```text
Build-LiveWallpaper.bat
```

Or run the PowerShell script directly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-lively.ps1
```

If your local npm install is working, this wrapper is also available:

```powershell
npm run package:lively
```

Generated outputs:

- `live-wallpaper/` is the self-contained static web wallpaper.
- `packages/PurplePlanet.lively` is the Lively package.
- `packages/PurplePlanet.zip` is the same package as a normal zip.

For Lively Wallpaper, drag `packages/PurplePlanet.lively` or `packages/PurplePlanet.zip` into the Lively window. If Windows associates `.lively` files with Lively, double-clicking `PurplePlanet.lively` will open it there. Enable `Start with Windows` inside Lively so the wallpaper starts on boot.

For Wallpaper Engine, create a web wallpaper from `live-wallpaper/index.html`, then enable Wallpaper Engine startup in its settings.

To preview the built wallpaper in your browser:

```text
Preview-LiveWallpaper.bat
```

## Use as a Windows screensaver

Double-click this from the repo root:

```text
Install-Screensaver.bat
```

The installer builds/uses `live-wallpaper/`, updates `PurplePlanet\config.json`, creates `PurplePlanet.scr`, registers it for the current Windows user, and opens Windows Screen Saver Settings. It does not need admin rights.

Power users can run it from a terminal:

```powershell
.\Install-Screensaver.bat
```

Optional timeout:

```powershell
.\Install-Screensaver.bat -TimeoutSeconds 600
```

## Wallpaper tuning

Use URL parameters when adding it to a wallpaper app:

- `?quality=low` for the lightest minimal mode.
- `?quality=balanced` keeps the aura, light leaks, spark heads, halo trails, and a small meteor pool enabled without postprocessing.
- `?quality=high` adds denser trails, particles, postprocessing, and more motion.
- `?quality=cinematic` is the default high-fidelity mode with dense particles, stronger glow, bloom, tone mapping, chromatic aberration, noise, and vignette.
- `?fps=30` is the default cap. Use `?fps=24` for lower GPU use or `?fps=0` to render every display refresh.
- `?speed=0.7` for slower drift.
- `?planetSpin=0.055` controls the slow planet surface rotation and the round bokeh accents near the planet edge. Use `0` to keep them fixed.
- `?planetBreath=0.04` controls the slow planet grow/shrink amount, and `?planetBreathSpeed=0.36` controls the cycle rate. Use `?planetBreath=0` to disable it.
- `?pixelRatio=1.35` is the cinematic default. Lower it toward `1` for less GPU load.
- `?postprocessing=false` disables the bloom/chromatic/noise/vignette pass if you need cinematic density without the extra shader pass.
- `?bloom=0.5`, `?bloomRadius=0.44`, `?bloomThreshold=0.62`, or `?exposure=0.82` tune the cinematic glow.
- `?cameraSway=0` disables the slow camera drift. Low mode disables it by default.
- `?theme=nebula` for the default blue-to-pink gradient.
- `?theme=aurora`, `?theme=ultraviolet`, `?theme=plasma`, or `?theme=candy` for alternate built-in palettes.
- `?palette=245dff,5146ff,8c35ff,f725d6,ff2f8a` for a custom gradient. Colors are ordered from outside rings to inside rings.

Example:

```text
http://127.0.0.1:5173/?quality=cinematic&fps=30&speed=0.85&pixelRatio=1.35&theme=nebula
```

Custom outside-to-inside palette:

```text
http://127.0.0.1:5173/?palette=1f5bff,3b52ff,7935ff,ff27c8,ff315f
```

For a mixed landscape/portrait monitor setup, configure the wallpaper host to span one web wallpaper across the full virtual desktop when available. Running separate instances per monitor will still look good, but the star positions will not be mathematically continuous across screen edges.
