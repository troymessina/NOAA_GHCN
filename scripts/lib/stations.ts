// Fetches and parses NOAA GHCN-Daily station metadata.
// Format spec: https://noaa-ghcn-pds.s3.amazonaws.com/readme.txt, section IV.

const BUCKET = 'https://noaa-ghcn-pds.s3.amazonaws.com'

export interface Station {
  id: string
  name: string
  lat: number
  lon: number
  elev: number
  state: string
}

export async function fetchText(path: string): Promise<string> {
  const res = await fetch(`${BUCKET}/${path}`)
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status} ${res.statusText}`)
  return res.text()
}

function parseStationLine(line: string): Station | null {
  if (line.trim().length === 0) return null
  const id = line.slice(0, 11).trim()
  const lat = Number.parseFloat(line.slice(12, 20))
  const lon = Number.parseFloat(line.slice(21, 30))
  const elev = Number.parseFloat(line.slice(31, 37))
  const state = line.slice(38, 40).trim()
  const name = line.slice(41, 71).trim()
  if (!id || Number.isNaN(lat) || Number.isNaN(lon)) return null
  return { id, name, lat, lon, elev, state }
}

export async function fetchStations(): Promise<Station[]> {
  const text = await fetchText('ghcnd-stations.txt')
  return text
    .split('\n')
    .map(parseStationLine)
    .filter((s): s is Station => s !== null)
}

export async function fetchStates(): Promise<Record<string, string>> {
  const text = await fetchText('ghcnd-states.txt')
  const states: Record<string, string> = {}
  for (const line of text.split('\n')) {
    if (line.trim().length === 0) continue
    const code = line.slice(0, 2).trim()
    const name = line.slice(3).trim()
    if (code && name) states[code] = name
  }
  return states
}
