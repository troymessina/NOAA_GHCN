import Plotly from 'plotly.js-dist-min'
import { fetchAllAggregates, fetchStates, type StateAggregates } from '../lib/catalog.ts'
import { convertForDisplay, displayUnit, elementByCode } from '../lib/elements.ts'
import type { Units } from '../lib/elements.ts'
import { readThemeColors } from '../lib/theme.ts'

export interface StateViewOptions {
  xCode: string
  yCode: string
  units: Units
  onSelectState?: (code: string) => void
  /** Returns false if a newer render has since been requested, so this one should stop touching the DOM. */
  isCurrent?: () => boolean
}

interface FramePoint {
  code: string
  name: string
  x: number
  y: number
  n: number
}

function buildYearData(
  allAgg: Record<string, StateAggregates>,
  states: Record<string, string>,
  xCode: string,
  yCode: string,
): Map<number, FramePoint[]> {
  const byYear = new Map<number, FramePoint[]>()
  for (const [code, agg] of Object.entries(allAgg)) {
    const xByYear = new Map((agg[xCode] ?? []).map((p) => [p.year, p]))
    const yByYear = new Map((agg[yCode] ?? []).map((p) => [p.year, p]))
    for (const [year, xp] of xByYear) {
      const yp = yByYear.get(year)
      if (!yp) continue
      if (!byYear.has(year)) byYear.set(year, [])
      byYear.get(year)!.push({ code, name: states[code] ?? code, x: xp.mean, y: yp.mean, n: xp.stations })
    }
  }
  return byYear
}

export async function renderStateView(container: HTMLElement, opts: StateViewOptions): Promise<void> {
  const isCurrent = opts.isCurrent ?? (() => true)
  container.innerHTML = '<div class="hint">Loading all states’ climate history…</div>'

  const [allAgg, states] = await Promise.all([fetchAllAggregates(), fetchStates()])
  if (!isCurrent()) return
  const byYear = buildYearData(allAgg, states, opts.xCode, opts.yCode)
  const years = [...byYear.keys()].sort((a, b) => a - b)

  if (years.length === 0) {
    container.innerHTML = '<div class="hint">No overlapping data for the selected variables.</div>'
    return
  }

  container.innerHTML = ''
  const plotDiv = document.createElement('div')
  plotDiv.className = 'plot'
  container.appendChild(plotDiv)

  const maxN = Math.max(...[...byYear.values()].flat().map((p) => p.n))
  const sizeOf = (n: number) => 6 + 34 * Math.sqrt(n / maxN)

  const xEl = elementByCode(opts.xCode)
  const yEl = elementByCode(opts.yCode)
  const convert = (code: string, v: number) => convertForDisplay(code, v, opts.units)
  const theme = readThemeColors()

  const toTrace = (points: FramePoint[]): Partial<Plotly.PlotData> => ({
    x: points.map((p) => convert(opts.xCode, p.x)),
    y: points.map((p) => convert(opts.yCode, p.y)),
    text: points.map((p) => `${p.name} (${p.n} stations)`),
    customdata: points.map((p) => p.code),
    mode: 'markers',
    type: 'scatter',
    marker: {
      size: points.map((p) => sizeOf(p.n)),
      color: theme.series1,
      opacity: 0.75,
      line: { width: 1, color: theme.surface },
    },
    hovertemplate: `%{text}<br>${xEl.label}: %{x} ${displayUnit(opts.xCode, opts.units)}<br>${yEl.label}: %{y} ${displayUnit(opts.yCode, opts.units)}<extra></extra>`,
  })

  const firstYear = years[0]
  const frames: Array<Partial<Plotly.Frame>> = years.map((year) => ({
    name: String(year),
    data: [toTrace(byYear.get(year)!)],
  }))

  const allX = [...byYear.values()].flat().map((p) => convert(opts.xCode, p.x))
  const allY = [...byYear.values()].flat().map((p) => convert(opts.yCode, p.y))
  const pad = (arr: number[]) => (Math.max(...arr) - Math.min(...arr)) * 0.08
  const xRange: [number, number] = [Math.min(...allX) - pad(allX), Math.max(...allX) + pad(allX)]
  const yRange: [number, number] = [Math.min(...allY) - pad(allY), Math.max(...allY) + pad(allY)]

  await Plotly.newPlot(
    plotDiv,
    [toTrace(byYear.get(firstYear)!)],
    {
      xaxis: { title: { text: `${xEl.label} (${displayUnit(opts.xCode, opts.units)})` }, range: xRange, gridcolor: theme.gridline },
      yaxis: { title: { text: `${yEl.label} (${displayUnit(opts.yCode, opts.units)})` }, range: yRange, gridcolor: theme.gridline },
      margin: { t: 30, r: 20, b: 50, l: 60 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: theme.textSecondary },
      updatemenus: [
        {
          type: 'buttons',
          showactive: false,
          x: 0,
          y: -0.18,
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
          y: -0.18,
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
