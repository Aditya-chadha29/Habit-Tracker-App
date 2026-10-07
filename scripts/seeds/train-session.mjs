// A workout in progress: Chest + Triceps started, with last week's numbers to compare against.
export default async (page) => {
  await page.evaluate(async () => {
    const db = window.__db
    const pad = (n) => String(n).padStart(2, '0')
    const dateOf = (offset) => {
      const d = new Date()
      d.setDate(d.getDate() - offset)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }
    const routine = (await db.table('routines').toArray()).find((r) => r.name === 'Chest + Triceps')
    const items = await db.table('routine_items').where('routine_id').equals(routine.id).sortBy('position')
    const base = [[60, 10], [60, 9], [57.5, 10]]
    const make = async (offset, ended, doneCount) => {
      const date = dateOf(offset)
      const now = Date.now()
      const sessionId = await db.table('sessions').add({
        date, routine_id: routine.id, title: routine.name, started_at: now - 24 * 60000 - 12000, ended_at: ended ? now - 1000 : null,
        notes: '', rest_started_at: ended ? null : now - 40000, rest_seconds: ended ? null : 150, kinds: ended ? ['strength'] : undefined,
      })
      let made = 0
      for (const item of items) {
        for (let i = 0; i < 3; i++) {
          const done = ended || made < doneCount
          const [w, r] = base[i]
          await db.table('set_logs').add({
            session_id: sessionId, exercise_id: item.exercise_id, date, position: item.position, set_index: i + 1,
            weight_kg: w - item.position * 7.5, reps: r, seconds: null, distance_m: null, rir: null, kind: 'work',
            done, done_at: done ? now - 60000 : null, note: '',
          })
          made += 1
        }
      }
      return sessionId
    }
    await make(7, true, 99)
    window.__seededSession = await make(0, false, 2)
  })
}
