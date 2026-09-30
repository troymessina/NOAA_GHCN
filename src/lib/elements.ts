// GHCN-Daily core element definitions.
// Raw DATA_VALUE units per https://noaa-ghcn-pds.s3.amazonaws.com/readme.txt (section III):
//   TMAX/TMIN: tenths of degrees C   PRCP: tenths of mm   SNOW/SNWD: mm

export interface ElementDef {
  code: string
  label: string
  /** Multiply the raw DATA_VALUE by this to get the value in `baseUnit`. */
  scale: number
  baseUnit: string
}

export const CORE_ELEMENTS: ElementDef[] = [
  { code: 'TMAX', label: 'Max Temperature', scale: 0.1, baseUnit: '°C' },
  { code: 'TMIN', label: 'Min Temperature', scale: 0.1, baseUnit: '°C' },
  { code: 'PRCP', label: 'Precipitation', scale: 0.1, baseUnit: 'mm' },
  { code: 'SNOW', label: 'Snowfall', scale: 1, baseUnit: 'mm' },
  { code: 'SNWD', label: 'Snow Depth', scale: 1, baseUnit: 'mm' },
]

export function elementByCode(code: string): ElementDef {
  const el = CORE_ELEMENTS.find((e) => e.code === code)
  if (!el) throw new Error(`Unknown element code: ${code}`)
  return el
}

export function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32
}

export function mmToInches(mm: number): number {
  return mm / 25.4
}

export type Units = 'metric' | 'imperial'

/** Converts a value already in the element's base (metric) unit to the display unit. */
export function convertForDisplay(code: string, value: number, units: Units): number {
  if (units === 'metric') return value
  const el = elementByCode(code)
  if (el.baseUnit === '°C') return Math.round(celsiusToFahrenheit(value) * 10) / 10
  if (el.baseUnit === 'mm') return Math.round(mmToInches(value) * 100) / 100
  return value
}

export function displayUnit(code: string, units: Units): string {
  const el = elementByCode(code)
  if (units === 'metric') return el.baseUnit
  if (el.baseUnit === '°C') return '°F'
  if (el.baseUnit === 'mm') return 'in'
  return el.baseUnit
}
