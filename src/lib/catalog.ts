// Loads the small, pre-built catalog/aggregate JSON files shipped in public/data/
// (see scripts/build-catalog.ts and scripts/build-aggregates.ts).

export interface StationSummary {
  id: string
  name: string
  lat: number
  lon: number
  elev: number
}

export interface AggregateYear {
  year: number
  n: number
  stations: number
  mean: number
  min: number
  max: number
}

export type StateAggregates = Record<string, AggregateYear[]>

const dataUrl = (p: string) => `${import.meta.env.BASE_URL}data/${p}`

const cache = new Map<string, Promise<unknown>>()

function cachedJson<T>(key: string, url: string): Promise<T> {
  if (!cache.has(key)) {
    cache.set(
      key,
      fetch(url).then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`)
        return res.json()
      }),
    )
  }
  return cache.get(key) as Promise<T>
}

export function fetchStates(): Promise<Record<string, string>> {
  return cachedJson('states', dataUrl('states.json'))
}

export function fetchStationIndex(): Promise<Record<string, number>> {
  return cachedJson('stations-index', dataUrl('stations/index.json'))
}

export function fetchStationsForState(state: string): Promise<StationSummary[]> {
  return cachedJson(`stations-${state}`, dataUrl(`stations/${state}.json`))
}

export function fetchAggregatesForState(state: string): Promise<StateAggregates> {
  return cachedJson(`aggregates-${state}`, dataUrl(`aggregates/${state}.json`))
}

/** Fetches every state's precomputed aggregates, for the cross-state animated view. */
export async function fetchAllAggregates(): Promise<Record<string, StateAggregates>> {
  const states = await fetchStates()
  const codes = Object.keys(states)
  const entries = await Promise.all(
    codes.map(async (code) => [code, await fetchAggregatesForState(code)] as const),
  )
  return Object.fromEntries(entries)
}
