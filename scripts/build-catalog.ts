// Builds the station/state catalog consumed by the frontend, and a local
// id->state lookup CSV used by build-aggregates.ts to join against parquet data.
//
// Output:
//   public/data/states.json           { "AL": "ALABAMA", ... }
//   public/data/stations/index.json   { "AL": 1234, ... }  (station counts per state)
//   public/data/stations/{STATE}.json [{ id, name, lat, lon, elev }, ...]
//   .data-cache/station_state.csv     id,state  (all stations with a state code)

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fetchStations, fetchStates } from './lib/stations.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const DATA_DIR = path.join(ROOT, 'public', 'data')
const CACHE_DIR = path.join(ROOT, '.data-cache')

async function main() {
  console.log('Fetching ghcnd-states.txt ...')
  const states = await fetchStates()

  console.log('Fetching ghcnd-stations.txt (~11MB) ...')
  const stations = await fetchStations()
  console.log(`Parsed ${stations.length} stations`)

  const byState = new Map<string, typeof stations>()
  for (const s of stations) {
    if (!s.state || !states[s.state]) continue
    if (!byState.has(s.state)) byState.set(s.state, [])
    byState.get(s.state)!.push(s)
  }

  // Order each state's list so full-service stations (airports/COOP) sort before
  // single-element volunteer networks (e.g. "1" = CoCoRaHS, precip-only), so the
  // frontend's default station selection lands on one with broad data coverage.
  // Network code is the 3rd character of the station ID; see readme.txt section IV.
  const NETWORK_PRIORITY: Record<string, number> = { W: 0, C: 1, M: 2, '0': 3, N: 4, R: 5, S: 6, E: 7, P: 8 }
  const networkRank = (id: string) => NETWORK_PRIORITY[id[2]] ?? 9
  for (const list of byState.values()) {
    list.sort((a, b) => networkRank(a.id) - networkRank(b.id) || a.name.localeCompare(b.name))
  }

  await mkdir(path.join(DATA_DIR, 'stations'), { recursive: true })
  await mkdir(CACHE_DIR, { recursive: true })

  await writeFile(path.join(DATA_DIR, 'states.json'), JSON.stringify(states, null, 0))

  const index: Record<string, number> = {}
  const stateStationCsvLines: string[] = ['id,state']
  for (const [code, list] of byState) {
    index[code] = list.length
    const slim = list.map(({ id, name, lat, lon, elev }) => ({ id, name, lat, lon, elev }))
    await writeFile(path.join(DATA_DIR, 'stations', `${code}.json`), JSON.stringify(slim))
    for (const s of list) stateStationCsvLines.push(`${s.id},${s.state}`)
  }
  await writeFile(path.join(DATA_DIR, 'stations', 'index.json'), JSON.stringify(index, null, 0))
  await writeFile(path.join(CACHE_DIR, 'station_state.csv'), stateStationCsvLines.join('\n'))

  console.log(`Wrote catalog for ${byState.size} states/provinces (${stations.length - [...byState.values()].flat().length} stations skipped for having no recognized state code).`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
