import {
  BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip,
  type ChartOptions,
} from 'chart.js'
import { useEffect, useMemo, useState } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import type { Tone } from './Chip'

// Only the pieces actually drawn are registered, so the rest of Chart.js is left out of the bundle.
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend)

export interface Series {
  label: string
  tone: Tone
  points: { x: string; y: number | null }[]
  dashed?: boolean
}

const VARIABLES = {
  neutral: '--color-ink-3',
  accent: '--color-accent-ink',
  ok: '--color-ok',
  warn: '--color-warn',
  risk: '--color-risk',
  mind: '--color-mind',
  body: '--color-body',
  learning: '--color-learning',
  exercise: '--color-exercise',
  grid: '--color-line',
  text: '--color-ink-3',
} as const

type ChartColors = Record<keyof typeof VARIABLES, string>

function readColors(): ChartColors {
  const style = getComputedStyle(document.documentElement)
  const out = {} as ChartColors
  for (const key of Object.keys(VARIABLES) as (keyof typeof VARIABLES)[]) {
    out[key] = style.getPropertyValue(VARIABLES[key]).trim() || '#888888'
  }
  return out
}

/**
 * The current theme's colours as literal values, for a canvas that cannot read CSS variables.
 * Re-read when the theme attribute or the system colour scheme changes.
 */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState(readColors)
  useEffect(() => {
    const refresh = () => setColors(readColors())
    const observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', refresh)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', refresh)
    }
  }, [])
  return colors
}

const identity = (x: string): string => x

interface LineChartProps {
  series: Series[]
  height?: number
  yMin?: number
  yMax?: number
  yFormat?: (value: number) => string
  xFormat?: (x: string) => string
  /** What the chart shows, in a sentence, for screen readers. */
  label: string
}

/** A line per series over a shared x axis. A null point leaves a gap; nothing is interpolated. */
export function LineChart({ series, height = 200, yMin, yMax, yFormat = String, xFormat = identity, label }: LineChartProps) {
  const colors = useChartColors()
  const labels = useMemo(() => series[0]?.points.map((point) => point.x) ?? [], [series])
  const sparse = labels.length <= 16

  const data = useMemo(
    () => ({
      labels,
      datasets: series.map((line) => ({
        label: line.label,
        data: line.points.map((point) => point.y),
        borderColor: colors[line.tone],
        backgroundColor: colors[line.tone],
        borderWidth: 2,
        borderDash: line.dashed ? [5, 4] : undefined,
        pointRadius: sparse ? 2.5 : 0,
        pointHoverRadius: 4,
        tension: 0.25,
        spanGaps: false,
      })),
    }),
    [series, labels, colors, sparse],
  )

  const options = useMemo<ChartOptions<'line'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      // Charts appear as they are. Growing into place is decoration, and a chart that depends on
      // a running clock to reach its real values can be caught half-drawn.
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: series.length > 1,
          position: 'bottom',
          labels: { color: colors.text, boxWidth: 8, boxHeight: 8, usePointStyle: true, padding: 14, font: { size: 11.5 } },
        },
        tooltip: {
          callbacks: {
            title: (items) => (items[0] ? xFormat(String(items[0].label)) : ''),
            label: (item) => `${item.dataset.label}: ${item.parsed.y === null ? '—' : yFormat(item.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: colors.grid },
          ticks: { color: colors.text, maxTicksLimit: 6, maxRotation: 0, font: { size: 11 }, callback: (_value, index) => xFormat(labels[index] ?? '') },
        },
        y: {
          min: yMin,
          max: yMax,
          grid: { color: colors.grid },
          border: { display: false },
          ticks: { color: colors.text, maxTicksLimit: 5, font: { size: 11 }, callback: (value) => yFormat(Number(value)) },
        },
      },
    }),
    [series.length, colors, labels, yMin, yMax, yFormat, xFormat],
  )

  return (
    <div role="img" aria-label={label} style={{ height }}>
      <Line data={data} options={options} />
    </div>
  )
}

interface BarChartProps {
  bars: { x: string; y: number | null; tone?: Tone }[]
  height?: number
  yMax?: number
  yFormat?: (value: number) => string
  xFormat?: (x: string) => string
  label: string
}

export function BarChart({ bars, height = 160, yMax, yFormat = String, xFormat = identity, label }: BarChartProps) {
  const colors = useChartColors()
  const data = useMemo(
    () => ({
      labels: bars.map((bar) => bar.x),
      datasets: [
        {
          data: bars.map((bar) => bar.y),
          backgroundColor: bars.map((bar) => colors[bar.tone ?? 'accent']),
          borderRadius: 4,
          maxBarThickness: 26,
        },
      ],
    }),
    [bars, colors],
  )

  const options = useMemo<ChartOptions<'bar'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => (items[0] ? xFormat(String(items[0].label)) : ''),
            label: (item) => (item.parsed.y === null ? '—' : yFormat(item.parsed.y)),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: colors.grid },
          ticks: { color: colors.text, maxTicksLimit: 7, maxRotation: 0, font: { size: 11 }, callback: (_value, index) => xFormat(bars[index]?.x ?? '') },
        },
        y: {
          beginAtZero: true,
          max: yMax,
          grid: { color: colors.grid },
          border: { display: false },
          ticks: { color: colors.text, maxTicksLimit: 4, font: { size: 11 }, callback: (value) => yFormat(Number(value)) },
        },
      },
    }),
    [bars, colors, yMax, yFormat, xFormat],
  )

  return (
    <div role="img" aria-label={label} style={{ height }}>
      <Bar data={data} options={options} />
    </div>
  )
}
