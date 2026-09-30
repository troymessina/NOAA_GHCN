import Plotly from 'plotly.js-dist-min'
import { fetchAllAggregates, fetchStates, type StateAggregates } from '../lib/catalog.ts'
import { convertForDisplay, displayUnit, elementByCode } from '../lib/elements.ts'
import type { Units } from '../lib/elements.ts'
import { readThemeColors } from '../lib/theme.ts'

export const MAX_SELECTED_STATES = 8

export interface StateViewOptions {
  xCode: string
  yCode: string
  units: Units
  /** Up to MAX_SELECTED_STATES state codes to highlight with distinct colors + a legend. Empty/undefined shows every state in one neutral color. */
  selectedCodes?: string[]
  onSelectState?: (code: string) => void
  /** Returns false if a newer render has since been requested, so this one should stop touching the DOM. */
  isCurrent?: () => boolean
}

interface StatePoint {
  year: number
  x: number
  y: number
  n: number
}

function buildPerStateSeries(
  allAgg: Record<string, StateAggregates>,
  xCode: string,
  yCode: string,
): Map<string, StatePoint[]> {
  const out = new Map<string, StatePoint[]>()
  for (const [code, agg] of Object.entries(allAgg)) {
    const xByYear = new Map((agg[xCode] ?? []).map((p) => [p.year, p]))
    const yByYear = new Map((agg[yCode] ?? []).map((p) => [p.year, p]))
    const points: StatePoint[] = []
    for (const [year, xp] of xByYear) {
      const yp = yByYear.get(year)
      if (!yp) continue
      points.push({ year, x: xp.mean, y: yp.mean, n: xp.stations })
    }
    points.sort((a, b) => a.year - b.year)
    if (points.length > 0) out.set(code, points)
  }
  return out
}

export async function renderStateView(container: HTMLElement, opts: StateViewOptions): Promise<void> {
  const isCurrent = opts.isCurrent ?? (() => true)
  container.innerHTML = '<div class="hint">Loading all states’ climate history…</div>'

  const [allAgg, states] = await Promise.all([fetchAllAggregates(), fetchStates()])
  if (!isCurrent()) return

  const perState = buildPerStateSeries(allAgg, opts.xCode, opts.yCode)
  const selected = (opts.selectedCodes ?? []).filter((c) => perState.has(c)).slice(0, MAX_SELECTED_STATES)
  const activeCodes = selected.length > 0 ? selected : [...perState.keys()]

  const years = [...new Set(activeCodes.flatMap((c) => perState.get(c)!.map((p) => p.year)))].sort((a, b) => a - b)

  if (years.length === 0) {
    container.innerHTML = '<div class="hint">No overlapping data for the selected variables.</div>'
    return
  }

  if (!isCurrent()) return
  container.innerHTML = ''
  const plotDiv = document.createElement('div')
  plotDiv.className = 'plot'
  container.appendChild(plotDiv)

  const activePoints = activeCodes.flatMap((c) => perState.get(c)!)
  const maxN = Math.max(...activePoints.map((p) => p.n))
  const sizeOf = (n: number) => 6 + 34 * Math.sqrt(n / maxN)

  const xEl = elementByCode(opts.xCode)
  const yEl = elementByCode(opts.yCode)
  const convert = (code: string, v: number) => convertForDisplay(code, v, opts.units)
  const theme = readThemeColors()
  const hoverTemplate = `%{text}<br>${xEl.label}: %{x} ${displayUnit(opts.xCode, opts.units)}<br>${yEl.label}: %{y} ${displayUnit(opts.yCode, opts.units)}<extra></extra>`

  const allX = activePoints.map((p) => convert(opts.xCode, p.x))
  const allY = activePoints.map((p) => convert(opts.yCode, p.y))
  const pad = (arr: number[]) => (Math.max(...arr) - Math.min(...arr)) * 0.08 || 1
  const xRange: [number, number] = [Math.min(...allX) - pad(allX), Math.max(...allX) + pad(allX)]
  const yRange: [number, number] = [Math.min(...allY) - pad(allY), Math.max(...allY) + pad(allY)]

  const isHighlighted = selected.length > 0
  const pointAt = (code: string, year: number) => perState.get(code)?.find((p) => p.year === year)

  let initialData: Partial<Plotly.PlotData>[]
  let frames: Array<Partial<Plotly.Frame>>

  if (isHighlighted) {
    // One trace per selected state, each its own categorical color + legend entry.
    const colorFor = (i: number) => theme.categorical[i % theme.categorical.length]
    const traceFor = (code: string, i: number, year: number): Partial<Plotly.PlotData> => {
      const p = pointAt(code, year)
      const name = states[code] ?? code
      return {
        // A fully empty trace (x: [], y: []) gets silently dropped from the Plotly
        // legend, so a state with no data point this year still needs a 1-element
        // array with a null coordinate - Plotly skips drawing it but keeps the
        // legend entry.
        x: p ? [convert(opts.xCode, p.x)] : [null],
        y: p ? [convert(opts.yCode, p.y)] : [null],
        text: p ? [`${name} (${p.n} stations)`] : [''],
        customdata: [code],
        name,
        mode: 'markers',
        type: 'scatter',
        marker: { size: p ? sizeOf(p.n) : 6, color: colorFor(i), opacity: 0.85, line: { width: 1, color: theme.surface } },
        hovertemplate: hoverTemplate,
      }
    }
    initialData = selected.map((code, i) => traceFor(code, i, years[0]))
    frames = years.map((year) => ({ name: String(year), data: selected.map((code, i) => traceFor(code, i, year)) }))
  } else {
    // All states in one neutral trace - a 70+-entry legend would be noise, not signal.
    const traceForYear = (year: number): Partial<Plotly.PlotData> => {
      const pts = activeCodes.map((code) => ({ code, p: pointAt(code, year) })).filter((e) => e.p)
      return {
        x: pts.map((e) => convert(opts.xCode, e.p!.x)),
        y: pts.map((e) => convert(opts.yCode, e.p!.y)),
        text: pts.map((e) => `${states[e.code] ?? e.code} (${e.p!.n} stations)`),
        customdata: pts.map((e) => e.code),
        mode: 'markers',
        type: 'scatter',
        marker: {
          size: pts.map((e) => sizeOf(e.p!.n)),
          color: theme.series1,
          opacity: 0.75,
          line: { width: 1, color: theme.surface },
        },
        hovertemplate: hoverTemplate,
      }
    }
    initialData = [traceForYear(years[0])]
    frames = years.map((year) => ({ name: String(year), data: [traceForYear(year)] }))
  }

  await Plotly.newPlot(
    plotDiv,
    initialData,
    {
      xaxis: { title: { text: `${xEl.label} (${displayUnit(opts.xCode, opts.units)})` }, range: xRange, gridcolor: theme.gridline },
      yaxis: { title: { text: `${yEl.label} (${displayUnit(opts.yCode, opts.units)})` }, range: yRange, gridcolor: theme.gridline },
      margin: { t: 30, r: 20, b: 50, l: 60 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: theme.textSecondary },
      showlegend: isHighlighted,
      legend: { orientation: 'h', y: -0.3 },
      updatemenus: [
        {
          type: 'buttons',
          showactive: false,
          x: 0,
          y: isHighlighted ? -0.42 : -0.18,
          xanchor: 'left',
          yanchor: 'top',
          buttons: [
            {
              label: '▶ Play',
              method: 'animate',
              args: [null, { fromcurrent: true, frame: { duration: 450, redraw: false }, transition: { duration: 300 } }],
            },
            {
              label: '⏸ Pause',
              method: 'animate',
              args: [[null], { mode: 'immediate', frame: { duration: 0, redraw: false } }],
            },
          ],
        },
      ],
      sliders: [
        {
          x: 0.12,
          y: isHighlighted ? -0.42 : -0.18,
          len: 0.88,
          currentvalue: { prefix: 'Year: ' },
          steps: years.map((year) => ({
            label: String(year),
            method: 'animate',
            args: [[String(year)], { mode: 'immediate', frame: { duration: 0, redraw: false }, transition: { duration: 0 } }],
          })),
        },
      ],
    },
    { responsive: true, displaylogo: false },
  )

  await Plotly.addFrames(plotDiv, frames as Plotly.Frame[])

  const plotEl = plotDiv as unknown as Plotly.PlotlyHTMLElement
  plotEl.on('plotly_click', (evt: Plotly.PlotMouseEvent) => {
    const code = evt.points[0]?.customdata as string | undefined
    if (code && opts.onSelectState) opts.onSelectState(code)
  })
}
