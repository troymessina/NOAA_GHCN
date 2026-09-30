import Plotly from 'plotly.js-dist-min'
import { aggregateSeries, fetchStationSeries, type Granularity } from '../lib/ghcnClient.ts'
import { convertForDisplay, displayUnit, elementByCode } from '../lib/elements.ts'
import type { Units } from '../lib/elements.ts'
import { readThemeColors } from '../lib/theme.ts'

export interface StationViewOptions {
  elementCode: string
  granularity: Granularity
  units: Units
  station: { id: string; name: string }
  compareStation?: { id: string; name: string }
  /** Returns false if a newer render has since been requested, so this one should stop touching the DOM. */
  isCurrent?: () => boolean
}

export async function renderStationView(container: HTMLElement, opts: StationViewOptions): Promise<void> {
  const isCurrent = opts.isCurrent ?? (() => true)
  container.innerHTML = '<div class="hint">Loading station data…</div>'

  const el = elementByCode(opts.elementCode)
  const theme = readThemeColors()

  const stationsToLoad = [opts.station, ...(opts.compareStation ? [opts.compareStation] : [])]
  const colors = [theme.series1, theme.series2]

  let traces: Partial<Plotly.PlotData>[]
  try {
    const results = await Promise.all(
      stationsToLoad.map(async (st) => {
        const series = await fetchStationSeries(st.id)
        const points = aggregateSeries(series[opts.elementCode] ?? [], opts.granularity)
        return { station: st, points }
      }),
    )

    if (!isCurrent()) return

    const empty = results.every((r) => r.points.length === 0)
    if (empty) {
      container.innerHTML = `<div class="hint">No ${el.label} data available for the selected station(s).</div>`
      return
    }

    traces = results.map((r, i) => ({
      x: r.points.map((p) => p.date),
      y: r.points.map((p) => convertForDisplay(opts.elementCode, p.value, opts.units)),
      type: 'scatter',
      mode: opts.granularity === 'daily' ? 'lines' : 'lines+markers',
      name: r.station.name,
      line: { color: colors[i], width: 1.5 },
      marker: { color: colors[i], size: 4 },
      hovertemplate: `%{x}<br>%{y} ${displayUnit(opts.elementCode, opts.units)}<extra>${r.station.name}</extra>`,
    }))
  } catch (err) {
    if (isCurrent()) {
      container.innerHTML = `<div class="hint">Failed to load station data: ${err instanceof Error ? err.message : String(err)}</div>`
    }
    return
  }

  if (!isCurrent()) return
  container.innerHTML = ''
  const plotDiv = document.createElement('div')
  plotDiv.className = 'plot'
  container.appendChild(plotDiv)

  await Plotly.newPlot(
    plotDiv,
    traces,
    {
      xaxis: {
        rangeslider: { visible: true },
        rangeselector: {
          buttons: [
            { count: 1, label: '1y', step: 'year', stepmode: 'backward' },
            { count: 5, label: '5y', step: 'year', stepmode: 'backward' },
            { count: 10, label: '10y', step: 'year', stepmode: 'backward' },
            { step: 'all', label: 'All' },
          ],
        },
        gridcolor: theme.gridline,
      },
      yaxis: { title: { text: `${el.label} (${displayUnit(opts.elementCode, opts.units)})` }, gridcolor: theme.gridline },
      margin: { t: 20, r: 20, b: 40, l: 60 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { color: theme.textSecondary },
      showlegend: traces.length > 1,
      legend: { orientation: 'h', y: -0.3 },
    },
    { responsive: true, displaylogo: false },
  )
}
