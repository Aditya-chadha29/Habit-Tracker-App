import { afterEach, describe, expect, it } from "vitest"
import { createDb, type AppDb } from "../db"
import { DEFAULT_PROMPTS, readSettings, saveSettings } from "../settingsRepo"
import { MIGRATIONS, runMigrations } from "./index"

let counter = 0
const open: AppDb[] = []

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})

/** A device as it stood before the evening-journal step: every earlier step done. */
async function before(): Promise<{ db: AppDb; backups: string }> {
  counter += 1
  const db = createDb(`evening-journal-${counter}`)
  open.push(db)
  const backups = `evening-journal-backups-${counter}`
  const earlier = MIGRATIONS.filter((step) => step.id !== "011-evening-journal")
  await runMigrations({ db, today: "2026-10-07", now: 1, theme: "system" }, { migrations: earlier, backupName: backups })
  return { db, backups }
}

const run = (db: AppDb, backups: string) => runMigrations({ db, today: "2026-10-08", now: 2, theme: "system" }, { backupName: backups })

describe("the journal becomes an evening page", () => {
  it("takes the morning questions off the page and keeps the evening ones", async () => {
    const { db, backups } = await before()
    const prompts = (await readSettings(db)).journal_prompts
    await saveSettings({ journal_prompts: { ...prompts, daily: [...DEFAULT_PROMPTS.morning, ...DEFAULT_PROMPTS.evening] } }, db)
    await run(db, backups)
    expect((await readSettings(db)).journal_prompts.daily).toEqual(DEFAULT_PROMPTS.evening)
  })

  it("keeps a question the user added themselves", async () => {
    const { db, backups } = await before()
    const prompts = (await readSettings(db)).journal_prompts
    await saveSettings({ journal_prompts: { ...prompts, daily: [...DEFAULT_PROMPTS.morning, "What will I do first tomorrow?", "What went well?"] } }, db)
    await run(db, backups)
    expect((await readSettings(db)).journal_prompts.daily).toEqual(["What will I do first tomorrow?", "What went well?"])
  })

  it("falls back to the evening questions when nothing else is left", async () => {
    const { db, backups } = await before()
    const prompts = (await readSettings(db)).journal_prompts
    await saveSettings({ journal_prompts: { ...prompts, daily: [...DEFAULT_PROMPTS.morning] } }, db)
    await run(db, backups)
    expect((await readSettings(db)).journal_prompts.daily).toEqual(DEFAULT_PROMPTS.evening)
  })

  it("runs once: a later edit to the questions is not undone", async () => {
    const { db, backups } = await before()
    await run(db, backups)
    const prompts = (await readSettings(db)).journal_prompts
    await saveSettings({ journal_prompts: { ...prompts, daily: ["What matters today?"] } }, db)
    await run(db, backups)
    expect((await readSettings(db)).journal_prompts.daily).toEqual(["What matters today?"])
  })
})
