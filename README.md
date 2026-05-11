# PurplePlanet

Lightweight Three.js orbital wallpaper for Lively Wallpaper, Wallpaper Engine, or a local browser window. It renders a fixed rim-lit planet and orbital plane while colorful light heads travel along the lanes, leaving glowing comet-like trails and particle wakes behind them.

## Run locally

```powershell
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Use as a live wallpaper

Build the static wallpaper bundle:

```powershell
npm run build
```

The generated `live-wallpaper` folder is self-contained and can be imported into a wallpaper app as a local web/HTML wallpaper. Point the wallpaper app at `live-wallpaper/index.html`.

## Wallpaper tuning

Use URL parameters when adding it to a wallpaper app:

- `?quality=low` for the lightest mode.
- `?quality=balanced` for a lighter everyday mode.
- `?quality=high` for denser sparkle.
- `?quality=cinematic` for the default high-fidelity mode with denser particles and stronger postprocessing.
- `?fps=30` caps rendering for lower GPU use. Use `?fps=24` for a lighter wallpaper or `?fps=0` to render every display refresh.
- `?speed=0.7` for slower drift.
- `?pixelRatio=1` to reduce GPU load on high-DPI displays.
- `?bloom=0.5`, `?bloomRadius=0.44`, `?bloomThreshold=0.62`, or `?exposure=0.82` to tune the cinematic glow.
- `?cameraSway=0` disables the slow handheld camera drift. `?cameraSway=1.5` makes it more noticeable.
- `?theme=nebula` for the default blue-to-pink gradient.
- `?theme=aurora`, `?theme=ultraviolet`, `?theme=plasma`, or `?theme=candy` for alternate built-in palettes.
- `?palette=245dff,5146ff,8c35ff,f725d6,ff2f8a` for a custom gradient. Colors are ordered from outside rings to inside rings.

Example:

```text
http://127.0.0.1:5173/?quality=balanced&fps=30&speed=0.85&pixelRatio=1.2&theme=nebula
```

Custom outside-to-inside palette:

```text
http://127.0.0.1:5173/?palette=1f5bff,3b52ff,7935ff,ff27c8,ff315f
```

For a mixed landscape/portrait monitor setup, configure the wallpaper host to span one web wallpaper across the full virtual desktop when available. Running separate instances per monitor will still look good, but the star positions will not be mathematically continuous across screen edges.
