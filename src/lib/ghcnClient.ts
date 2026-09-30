import Papa from 'papaparse'
import { getCached, setCached } from './cache.ts'
import { CORE_ELEMENTS, elementByCode } from './elements.ts'

const BUCKET = 'https://noaa-ghcn-pds.s3.amazonaws.com'

export interface SeriesPoint {
  date: string // YYYY-MM-DD
  value: number // already scaled to the element's base unit
}

export type StationSeries = Record<string, SeriesPoint[]> // element code -> points, sorted by date

interface RawRow {
  ID: string
  DATE: string
  ELEMENT: string
  DATA_VALUE: string
  Q_FLAG: string
}

const CORE_CODES = new Set(CORE_ELEMENTS.map((e) => e.code))

function toIsoDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}

function pivot(rows: RawRow[]): StationSeries {
  const series: StationSeries = {}
  for (const row of rows) {
    if (!CORE_CODES.has(row.ELEMENT)) continue
    if (row.Q_FLAG && row.Q_FLAG.trim() !== '') continue // drop QC-failed observations
    const raw = Number(row.DATA_VALUE)
    if (!Number.isFinite(raw)) continue
    const el = elementByCode(row.ELEMENT)
    if (!series[row.ELEMENT]) series[row.ELEMENT] = []
    series[row.ELEMENT].push({ date: toIsoDate(row.DATE), value: Math.round(raw * el.scale * 100) / 100 })
  }
  for (const points of Object.values(series)) {
    points.sort((a, b) => (a.date < b.date ? -1 : 1))
  }
  return series
}

export async function fetchStationSeries(stationId: string): Promise<StationSeries> {
  const cacheKey = `series-v1-${stationId}`
  const cached = await getCached<StationSeries>(cacheKey)
  if (cached) return cached

  const res = await fetch(`${BUCKET}/csv/by_station/${stationId}.csv`)
  if (!res.ok) throw new Error(`Failed to fetch station ${stationId}: ${res.status} ${res.statusText}`)
  const text = await res.text()

  const parsed = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true })
  const series = pivot(parsed.data)

  await setCached(cacheKey, series)
  return series
}

export type Granularity = 'daily' | 'monthly' | 'annual'

export function aggregateSeries(points: SeriesPoint[], granularity: Granularity): SeriesPoint[] {
  if (granularity === 'daily') return points
  const bucketKey = (date: string) => (granularity === 'monthly' ? date.slice(0, 7) : date.slice(0, 4))
  const sums = new Map<string, { sum: number; n: number }>()
  for (const p of points) {
    const key = bucketKey(p.date)
    const entry = sums.get(key) ?? { sum: 0, n: 0 }
    entry.sum += p.value
    entry.n += 1
    sums.set(key, entry)
  }
  return [...sums.entries()]
    .map(([key, { sum, n }]) => ({ date: granularity === 'monthly' ? `${key}-01` : `${key}-01-01`, value: Math.round((sum / n) * 100) / 100 }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}
