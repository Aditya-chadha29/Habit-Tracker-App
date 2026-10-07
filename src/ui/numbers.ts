/** How many decimal places a step implies: 2.5 → 1, 0.25 → 2, 1 → 0. */
export function decimalsOf(step: number): number {
  const text = String(step)
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}

/**
 * One press of a stepper. The result is snapped to the step's precision, so repeated presses of
 * 2.5 never drift into 57.49999999, and it is kept inside the bounds.
 */
export function stepValue(value: number, step: number, direction: 1 | -1, min = -Infinity, max = Infinity): number {
  const factor = 10 ** Math.max(decimalsOf(step), decimalsOf(value))
  const next = Math.round((value + direction * step) * factor) / factor
  return Math.min(max, Math.max(min, next))
}

/** Reads a number a person typed: accepts a comma as the decimal mark, rejects anything else. */
export function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(',', '.')
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/** A number without trailing zeros: 60, 57.5, 0.25. */
export function formatNumber(value: number, maxDecimals = 2): string {
  const factor = 10 ** maxDecimals
  return String(Math.round(value * factor) / factor)
}
