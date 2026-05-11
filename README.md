# PurplePlanet

Lightweight Three.js orbital wallpaper for Lively Wallpaper, Wallpaper Engine, or a local browser window. It renders a fixed violet planet and orbital plane while colorful star sprites travel along the lanes, leaving glowing comet-like trails behind them.

## Run locally

```powershell
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Wallpaper tuning

Use URL parameters when adding it to a wallpaper app:

- `?quality=low` for the lightest mode.
- `?quality=balanced` for the default.
- `?quality=high` for denser sparkle.
- `?speed=0.7` for slower drift.
- `?pixelRatio=1` to reduce GPU load on high-DPI displays.
- `?theme=nebula` for the default blue-to-pink gradient.
- `?theme=aurora`, `?theme=ultraviolet`, `?theme=plasma`, or `?theme=candy` for alternate built-in palettes.
- `?palette=245dff,5146ff,8c35ff,f725d6,ff2f8a` for a custom gradient. Colors are ordered from outside rings to inside rings.

Example:

```text
http://127.0.0.1:5173/?quality=balanced&speed=0.85&pixelRatio=1.2&theme=nebula
```

Custom outside-to-inside palette:

```text
http://127.0.0.1:5173/?palette=1f5bff,3b52ff,7935ff,ff27c8,ff315f
```

For a mixed landscape/portrait monitor setup, configure the wallpaper host to span one web wallpaper across the full virtual desktop when available. Running separate instances per monitor will still look good, but the star positions will not be mathematically continuous across screen edges.
