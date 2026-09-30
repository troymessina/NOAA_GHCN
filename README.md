# NOAA GHCN-Daily Explorer

A static web app for plotting and comparing NOAA [GHCN-Daily](https://noaa-ghcn-pds.s3.amazonaws.com/index.html) weather station records, deployed as a GitHub Page. No backend — the deployed site talks directly to NOAA's public S3 bucket (CORS-enabled) and to a small pre-built catalog checked into this repo.

**Live site:** https://troymessina.github.io/NOAA_GHCN/

## Features

- **Station Explorer** — pick a state/province, then a station, then a variable (max/min temperature, precipitation, snowfall, snow depth). Plots daily, monthly-mean, or annual-mean history with Plotly's native zoom/pan and range slider, fetched live from NOAA. Optionally overlay a second station for comparison.
- **State Comparison** — every state/province plotted at once as an animated, Gapminder-style bubble chart (x/y axes and units are configurable), with play/pause and a draggable year slider. Check up to 8 states in the sidebar to give them distinct colors and a legend; leave none checked to see all states in one color. Click any bubble to jump to that state's stations.

## How it works

GitHub Pages only serves static files, so there's no backend:

- **Station Explorer** fetches each station's full daily history directly from `https://noaa-ghcn-pds.s3.amazonaws.com/csv/by_station/{ID}.csv` at view time (the bucket sends `Access-Control-Allow-Origin: *`), parses it client-side, and caches the result in IndexedDB so revisits don't re-download it.
- **State Comparison** would be far too slow if it fetched every station in every state client-side, so its per-state, per-year summary stats (mean/min/max, station count) are precomputed by `scripts/build-aggregates.ts` using [DuckDB](https://duckdb.org/) + `httpfs` against the dataset's `parquet/by_year/` partitions, and committed to `public/data/aggregates/`.
- Station/state metadata (`public/data/states.json`, `public/data/stations/*.json`) is built by `scripts/build-catalog.ts` from `ghcnd-stations.txt` / `ghcnd-states.txt`.

## Local development

```bash
npm install
npm run dev
```

## Data pipeline

The catalog and aggregates in `public/data/` are committed to the repo (so the site works without a build step) and refreshed automatically on a weekly schedule by [`.github/workflows/refresh-data.yml`](.github/workflows/refresh-data.yml). To regenerate them locally:

```bash
npm run data:catalog     # station/state metadata -> public/data/states.json, stations/*.json
npm run data:aggregates  # per-state/year aggregates -> public/data/aggregates/*.json
```

`data:aggregates` shells out to the DuckDB CLI. It looks for a binary at `tools/duckdb(.exe)`, or set `DUCKDB_PATH` to point at one, or have `duckdb` on `PATH`. Download it from [duckdb.org/docs/installation](https://duckdb.org/docs/installation).

## Deployment

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds the site with Vite and publishes it to GitHub Pages on every push to `main` (Settings → Pages → Source must be set to "GitHub Actions").

## Tech stack

Vite, TypeScript, [Plotly.js](https://plotly.com/javascript/), [PapaParse](https://www.papaparse.com/) — no UI framework.
