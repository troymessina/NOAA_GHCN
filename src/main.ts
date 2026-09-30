import './style.css'
import { fetchStates, fetchStationsForState, type StationSummary } from './lib/catalog.ts'
import { CORE_ELEMENTS } from './lib/elements.ts'
import type { Units } from './lib/elements.ts'
import type { Granularity } from './lib/ghcnClient.ts'
import { renderStationView } from './views/stationView.ts'
import { renderStateView } from './views/stateView.ts'

type Tab = 'station' | 'state'

interface AppState {
  tab: Tab
  states: Record<string, string>
  selectedState: string
  stationsInState: StationSummary[]
  stationFilter: string
  selectedStationId: string | null
  compareEnabled: boolean
  compareStationId: string | null
  elementCode: string
  granularity: Granularity
  units: Units
  xCode: string
  yCode: string
}

const state: AppState = {
  tab: 'station',
  states: {},
  selectedState: '',
  stationsInState: [],
  stationFilter: '',
  selectedStationId: null,
  compareEnabled: false,
  compareStationId: null,
  elementCode: 'TMAX',
  granularity: 'monthly',
  units: 'metric',
  xCode: 'PRCP',
  yCode: 'TMAX',
}

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <header>
    <h1>NOAA GHCN-Daily Explorer</h1>
    <p>Daily weather station records from NOAA's Global Historical Climatology Network, fetched live from the public dataset.</p>
  </header>
  <div class="layout">
    <aside id="sidebar"></aside>
    <main>
      <div class="tabs">
        <button data-tab="station" class="active">Station Explorer</button>
        <button data-tab="state">State Comparison</button>
      </div>
      <div class="chart-panel">
        <div id="status" class="status"></div>
        <div id="chart-container"></div>
      </div>
    </main>
  </div>
`

const sidebarEl = document.querySelector<HTMLDivElement>('#sidebar')!
const chartContainer = document.querySelector<HTMLDivElement>('#chart-container')!
const statusEl = document.querySelector<HTMLDivElement>('#status')!
const tabButtons = [...document.querySelectorAll<HTMLButtonElement>('.tabs button')]

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.tab = btn.dataset.tab as Tab
    tabButtons.forEach((b) => b.classList.toggle('active', b === btn))
    renderSidebar()
    renderChart()
  })
})

function elementOptions(selected: string): string {
  return CORE_ELEMENTS.map((e) => `<option value="${e.code}" ${e.code === selected ? 'selected' : ''}>${e.label}</option>`).join('')
}

async function loadStationsForState(code: string) {
  statusEl.textContent = `Loading stations for ${state.states[code] ?? code}…`
  state.stationsInState = await fetchStationsForState(code)
  state.selectedStationId = state.stationsInState[0]?.id ?? null
  state.compareStationId = null
  statusEl.textContent = ''
}

function renderSidebar() {
  if (state.tab === 'station') {
    sidebarEl.innerHTML = `
      <div class="field">
        <label for="state-select">State / Province</label>
        <select id="state-select">
          ${Object.entries(state.states)
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([code, name]) => `<option value="${code}" ${code === state.selectedState ? 'selected' : ''}>${name}</option>`)
            .join('')}
        </select>
      </div>
      <div class="field">
        <label for="station-filter">Find a station</label>
        <input id="station-filter" type="search" placeholder="Search by name or ID" value="${state.stationFilter}" />
      </div>
      <div class="field">
        <div id="station-list" class="station-list"></div>
      </div>
      <div class="field checkbox-row">
        <input id="compare-toggle" type="checkbox" ${state.compareEnabled ? 'checked' : ''} />
        <label for="compare-toggle" style="margin:0;">Compare with a second station</label>
      </div>
      ${state.compareEnabled ? '<div class="field"><div id="compare-list" class="station-list"></div></div>' : ''}
      <div class="field">
        <label for="element-select">Variable</label>
        <select id="element-select">${elementOptions(state.elementCode)}</select>
      </div>
      <div class="field">
        <label for="granularity-select">Aggregation</label>
        <select id="granularity-select">
          <option value="daily" ${state.granularity === 'daily' ? 'selected' : ''}>Daily</option>
          <option value="monthly" ${state.granularity === 'monthly' ? 'selected' : ''}>Monthly mean</option>
          <option value="annual" ${state.granularity === 'annual' ? 'selected' : ''}>Annual mean</option>
        </select>
      </div>
      <div class="field">
        <label for="units-select">Units</label>
        <select id="units-select">
          <option value="metric" ${state.units === 'metric' ? 'selected' : ''}>Metric (°C, mm)</option>
          <option value="imperial" ${state.units === 'imperial' ? 'selected' : ''}>Imperial (°F, in)</option>
        </select>
      </div>
    `

    document.querySelector<HTMLSelectElement>('#state-select')!.addEventListener('change', async (e) => {
      state.selectedState = (e.target as HTMLSelectElement).value
      await loadStationsForState(state.selectedState)
      renderStationList()
      renderChart()
    })
    document.querySelector<HTMLInputElement>('#station-filter')!.addEventListener('input', (e) => {
      state.stationFilter = (e.target as HTMLInputElement).value
      renderStationList()
    })
    document.querySelector<HTMLInputElement>('#compare-toggle')!.addEventListener('change', (e) => {
      state.compareEnabled = (e.target as HTMLInputElement).checked
      if (!state.compareEnabled) state.compareStationId = null
      renderSidebar()
      renderChart()
    })
    document.querySelector<HTMLSelectElement>('#element-select')!.addEventListener('change', (e) => {
      state.elementCode = (e.target as HTMLSelectElement).value
      renderChart()
    })
    document.querySelector<HTMLSelectElement>('#granularity-select')!.addEventListener('change', (e) => {
      state.granularity = (e.target as HTMLSelectElement).value as Granularity
      renderChart()
    })
    document.querySelector<HTMLSelectElement>('#units-select')!.addEventListener('change', (e) => {
      state.units = (e.target as HTMLSelectElement).value as Units
      renderChart()
    })

    renderStationList()
  } else {
    sidebarEl.innerHTML = `
      <p class="hint">Every state/province plotted at once, one bubble per year — press Play or drag the slider. Click a bubble to jump to that state's stations.</p>
      <div class="field">
        <label for="x-select">X axis</label>
        <select id="x-select">${elementOptions(state.xCode)}</select>
      </div>
      <div class="field">
        <label for="y-select">Y axis</label>
        <select id="y-select">${elementOptions(state.yCode)}</select>
      </div>
      <div class="field">
        <label for="units-select-2">Units</label>
        <select id="units-select-2">
          <option value="metric" ${state.units === 'metric' ? 'selected' : ''}>Metric (°C, mm)</option>
          <option value="imperial" ${state.units === 'imperial' ? 'selected' : ''}>Imperial (°F, in)</option>
        </select>
      </div>
    `
    document.querySelector<HTMLSelectElement>('#x-select')!.addEventListener('change', (e) => {
      state.xCode = (e.target as HTMLSelectElement).value
      renderChart()
    })
    document.querySelector<HTMLSelectElement>('#y-select')!.addEventListener('change', (e) => {
      state.yCode = (e.target as HTMLSelectElement).value
      renderChart()
    })
    document.querySelector<HTMLSelectElement>('#units-select-2')!.addEventListener('change', (e) => {
      state.units = (e.target as HTMLSelectElement).value as Units
      renderChart()
    })
  }
}

function renderStationList() {
  const listEl = document.querySelector<HTMLDivElement>('#station-list')
  if (!listEl) return
  const filter = state.stationFilter.trim().toLowerCase()
  const filtered = filter
    ? state.stationsInState.filter((s) => s.name.toLowerCase().includes(filter) || s.id.toLowerCase().includes(filter))
    : state.stationsInState
  listEl.innerHTML = filtered
    .slice(0, 300)
    .map((s) => `<button data-id="${s.id}" class="${s.id === state.selectedStationId ? 'active' : ''}">${s.name}</button>`)
    .join('')
  listEl.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedStationId = btn.dataset.id!
      renderStationList()
      renderChart()
    })
  })

  if (state.compareEnabled) {
    const compareListEl = document.querySelector<HTMLDivElement>('#compare-list')
    if (compareListEl) {
      compareListEl.innerHTML = filtered
        .slice(0, 300)
        .map((s) => `<button data-id="${s.id}" class="${s.id === state.compareStationId ? 'active' : ''}">${s.name}</button>`)
        .join('')
      compareListEl.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.compareStationId = btn.dataset.id!
          renderStationList()
          renderChart()
        })
      })
    }
  }
}

let renderGeneration = 0

async function renderChart() {
  const myGeneration = ++renderGeneration
  const isCurrent = () => myGeneration === renderGeneration
  try {
    await renderChartInner(isCurrent)
  } catch (err) {
    if (isCurrent()) {
      chartContainer.innerHTML = `<div class="hint">Something went wrong: ${err instanceof Error ? err.message : String(err)}</div>`
    }
  }
}

async function renderChartInner(isCurrent: () => boolean) {
  if (state.tab === 'station') {
    const station = state.stationsInState.find((s) => s.id === state.selectedStationId)
    if (!station) {
      chartContainer.innerHTML = '<div class="hint">Select a station to plot its history.</div>'
      return
    }
    const compare = state.compareEnabled ? state.stationsInState.find((s) => s.id === state.compareStationId) : undefined
    await renderStationView(chartContainer, {
      elementCode: state.elementCode,
      granularity: state.granularity,
      units: state.units,
      station: { id: station.id, name: station.name },
      compareStation: compare ? { id: compare.id, name: compare.name } : undefined,
      isCurrent,
    })
  } else {
    await renderStateView(chartContainer, {
      xCode: state.xCode,
      yCode: state.yCode,
      units: state.units,
      isCurrent,
      onSelectState: async (code) => {
        state.tab = 'station'
        state.selectedState = code
        tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === 'station'))
        await loadStationsForState(code)
        renderSidebar()
        await renderChart()
      },
    })
  }
}

async function init() {
  statusEl.textContent = 'Loading catalog…'
  state.states = await fetchStates()
  state.selectedState = state.states['CO'] ? 'CO' : Object.keys(state.states)[0]
  await loadStationsForState(state.selectedState)
  renderSidebar()
  await renderChart()
}

init().catch((err) => {
  statusEl.textContent = `Failed to load: ${err instanceof Error ? err.message : String(err)}`
})
