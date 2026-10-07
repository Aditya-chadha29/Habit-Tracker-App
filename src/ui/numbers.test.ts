import { describe, expect, it } from 'vitest'
import { decimalsOf, formatNumber, parseNumber, stepValue } from './numbers'

describe('stepper arithmetic', () => {
  it('steps without floating-point drift', () => {
    let value = 55
    for (let i = 0; i < 7; i++) value = stepValue(value, 2.5, 1)
    expect(value).toBe(72.5)
    expect(stepValue(0.1, 0.2, 1)).toBe(0.3)
    expect(stepValue(57.5, 2.5, -1)).toBe(55)
  })

  it('stays inside its bounds', () => {
    expect(stepValue(0, 1, -1, 0)).toBe(0)
    expect(stepValue(9, 5, 1, 0, 10)).toBe(10)
  })

  it('keeps the precision of a value finer than the step', () => {
    expect(stepValue(57.25, 2.5, 1)).toBe(59.75)
  })

  it('counts decimals', () => {
    expect([1, 2.5, 0.25, 10].map(decimalsOf)).toEqual([0, 1, 2, 0])
  })
})

describe('typed numbers', () => {
  it('accepts plain numbers and a decimal comma', () => {
    expect(parseNumber('60')).toBe(60)
    expect(parseNumber(' 57.5 ')).toBe(57.5)
    expect(parseNumber('70,8')).toBe(70.8)
    expect(parseNumber('.5')).toBe(0.5)
  })

  it('rejects everything else', () => {
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('abc')).toBeNull()
    expect(parseNumber('1.2.3')).toBeNull()
    expect(parseNumber('60kg')).toBeNull()
  })

  it('prints without trailing zeros', () => {
    expect(formatNumber(60)).toBe('60')
    expect(formatNumber(57.5)).toBe('57.5')
    expect(formatNumber(70.8000001)).toBe('70.8')
  })
})
