import { describe, expect, it } from 'vitest'
import { habit, version } from '../../testing/builders'
import { excerpt, search, type SearchSources } from './search'

const sources: SearchSources = {
  habits: [habit({ id: 1, name: 'Hair care', from: '2026-08-01' }, [version('2026-10-06', { name: 'Hair oiling' })]), habit({ id: 2, name: 'Meditation', from: '2026-08-01' })],
  journal: [
    { id: 1, date: '2026-10-01', kind: 'evening', answers: [{ prompt: 'What went well?', text: 'Finished the paneer experiment early' }], text: '', created_at: 1, updated_at: 1 },
    { id: 2, date: '2026-10-05', kind: 'general', answers: [], text: 'A long note. '.repeat(20) + 'Paneer again tonight.', created_at: 2, updated_at: 2 },
  ],
  meals: [
    { date: '2026-10-02', slot: 'dinner', text: 'Paneer, vegetables', ate_out: true },
    { date: '2026-10-03', slot: 'lunch', text: 'Rajma, rice', ate_out: false },
  ],
  resources: [],
  quotes: [],
  sessions: [],
  exercises: [],
}
const date = (value: string) => value

describe('search', () => {
  it('finds the words wherever they were written, newest first, grouped by what it is', () => {
    const groups = search('  PANEER ', sources, date)
    expect(groups.map((group) => group.label)).toEqual(['Journal', 'Meals'])
    expect(groups[0].hits.map((hit) => hit.detail)).toEqual(['2026-10-05 · general', '2026-10-01 · evening'])
    expect(groups[0].hits[0].title).toContain('Paneer again tonight')
    expect(groups[1].hits[0]).toMatchObject({ title: 'Paneer, vegetables', detail: '2026-10-02 · dinner · ate out' })
  })

  it('finds a habit by a name it used to have', () => {
    const groups = search('hair care', sources, date)
    expect(groups[0].hits.map((hit) => hit.title)).toEqual(['Hair oiling'])
    expect(groups[0].hits[0].to).toBe('/progress/habit/1')
  })

  it('asks for at least two characters and returns nothing for no match', () => {
    expect(search('p', sources, date)).toEqual([])
    expect(search('zzz', sources, date)).toEqual([])
  })

  it('cuts a long text down to the part that matched', () => {
    const text = 'a'.repeat(200) + ' needle ' + 'b'.repeat(200)
    const cut = excerpt(text, 'needle', 10)
    expect(cut.startsWith('…')).toBe(true)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut).toContain('needle')
    expect(cut.length).toBeLessThan(40)
  })
})
