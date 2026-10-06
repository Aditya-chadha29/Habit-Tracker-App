import { afterEach, describe, expect, it } from 'vitest'
import { createDb, type AppDb } from './db'
import { DEFAULT_SETTINGS, readSettings, saveSettings, settingsFromRows } from './settingsRepo'

const open: AppDb[] = []
let counter = 0

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})

describe('settings', () => {
  it('has every default when nothing is stored', () => {
    expect(settingsFromRows([])).toEqual(DEFAULT_SETTINGS)
  })

  it('reads back what was saved and leaves other keys alone', async () => {
    const db = createDb(`settings-test-${++counter}`)
    open.push(db)
    await saveSettings({ name: 'Aditya', week_start: 6 }, db)
    await saveSettings({ edit_window_days: 10 }, db)
    const settings = await readSettings(db)
    expect(settings).toMatchObject({ name: 'Aditya', week_start: 6, edit_window_days: 10, theme: 'system' })
  })

  it('falls back to the default for any value that makes no sense', () => {
    const settings = settingsFromRows([
      { key: 'week_start', value: 9 },
      { key: 'theme', value: 'neon' },
      { key: 'edit_window_days', value: 0 },
      { key: 'day_start_hour', value: 'four' },
      { key: 'areas', value: [] },
      { key: 'journal_prompts', value: { morning: [1, 2] } },
      { key: 'weight_unit', value: 'stone' },
    ])
    expect(settings).toEqual(DEFAULT_SETTINGS)
  })
})
