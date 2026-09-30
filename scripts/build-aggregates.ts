// Precomputes per-state, per-year summary stats for the core elements, so the
// frontend's state-level "Gapminder" view doesn't need to fetch every station's
// full daily history client-side. Requires scripts/build-catalog.ts to have run
// first (it produces .data-cache/station_state.csv, which this script joins
// against the public parquet/by_year data via DuckDB + httpfs).
//
// Usage: npm run data:aggregates
//   DUCKDB_PATH=/path/to/duckdb   override which duckdb binary to use

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { runDuckDbSql } from './lib/duckdb.ts'
import { CORE_ELEMENTS } from '../src/lib/elements.ts'
import { fetchStates } from './lib/stations.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const CACHE_DIR = path.join(ROOT, '.data-cache')
const DATA_DIR = path.join(ROOT, 'public', 'data')
const STATION_STATE_CSV = path.join(CACHE_DIR, 'station_state.csv')

interface Row {
  state: string
  year: number
  n: number
  stations: number
  avg_raw: number
  min_raw: number
  max_raw: number
}

async function aggregateElement(code: string): Promise<Row[]> {
  const outFile = path.join(CACHE_DIR, `agg_${code}.json`)
  const sql = `
INSTALL httpfs;
LOAD httpfs;
SET s3_region='us-east-1';
CREATE TABLE station_state AS SELECT * FROM read_csv('${STATION_STATE_CSV.replace(/\\/g, '/')}', header=true);
COPY (
  SELECT s.state AS state, p.YEAR AS year, count(*) n, count(DISTINCT p.ID) stations,
         avg(p.DATA_VALUE) avg_raw, min(p.DATA_VALUE) min_raw, max(p.DATA_VALUE) max_raw
  FROM read_parquet('s3://noaa-ghcn-pds/parquet/by_year/YEAR=*/ELEMENT=${code}/*.parquet', hive_partitioning=1) p
  JOIN station_state s ON s.id = p.ID
  WHERE (p.Q_FLAG IS NULL OR p.Q_FLAG = '')
  GROUP BY s.state, p.YEAR
  ORDER BY s.state, p.YEAR
) TO '${outFile.replace(/\\/g, '/')}' (FORMAT JSON, ARRAY true);
`
  console.log(`Aggregating ${code} (this scans the full GHCN parquet history for this element) ...`)
  runDuckDbSql(sql)
  const rows: Row[] = JSON.parse(await readFile(outFile, 'utf-8'))
  console.log(`  ${code}: ${rows.length} state-year rows`)
  return rows
}

async function main() {
  if (!existsSync(STATION_STATE_CSV)) {
    throw new Error(`Missing ${STATION_STATE_CSV}. Run "npm run data:catalog" first.`)
  }
  await mkdir(path.join(DATA_DIR, 'aggregates'), { recursive: true })

  const byState = new Map<string, Record<string, unknown[]>>()

  for (const el of CORE_ELEMENTS) {
    const rows = await aggregateElement(el.code)
    for (const r of rows) {
      if (!byState.has(r.state)) byState.set(r.state, {})
      const stateEntry = byState.get(r.state)!
      if (!stateEntry[el.code]) stateEntry[el.code] = []
      ;(stateEntry[el.code] as unknown[]).push({
        year: r.year,
        n: r.n,
        stations: r.stations,
        mean: round2(r.avg_raw * el.scale),
        min: round2(r.min_raw * el.scale),
        max: round2(r.max_raw * el.scale),
      })
    }
  }

  // Write a file for every state in the catalog, even ones with no qualifying
  // rows (e.g. a territory with only volunteer precip gauges), so the frontend
  // never has to special-case a missing file - a real (possibly empty) JSON
  // response either way, in both dev and the static production deploy.
  const allStates = await fetchStates()
  for (const code of Object.keys(allStates)) {
    const elements = byState.get(code) ?? {}
    await writeFile(path.join(DATA_DIR, 'aggregates', `${code}.json`), JSON.stringify(elements))
  }

  console.log(`Wrote aggregates for ${Object.keys(allStates).length} states/provinces (${byState.size} with data).`)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
