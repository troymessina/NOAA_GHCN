// Plotly sets colors as raw SVG attributes, not through the CSS cascade, so
// CSS custom properties (var(--foo)) don't resolve inside its config. Resolve
// the values we need once, from the live computed style, instead.

export interface ThemeColors {
  surface: string
  textSecondary: string
  gridline: string
  series1: string
  series2: string
}

export function readThemeColors(): ThemeColors {
  const style = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    surface: get('--surface-1', '#fcfcfb'),
    textSecondary: get('--text-secondary', '#52514e'),
    gridline: get('--gridline', '#e1e0d9'),
    series1: get('--series-1', '#2a78d6'),
    series2: get('--series-2', '#eb6834'),
  }
}
