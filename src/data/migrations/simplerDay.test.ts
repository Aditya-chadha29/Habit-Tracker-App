import { afterEach, describe, expect, it } from "vitest"
import { createDb, type AppDb } from "../db"
import { setHabitDone } from "../habitRepo"
import { dueItems } from "../../engine/score"
import { buildCompletionIndex } from "../../engine/completion"
import { MIGRATIONS, runMigrations } from "./index"

let counter = 0
const open: AppDb[] = []

afterEach(async () => {
  for (const db of open.splice(0)) await db.delete()
})

async function before(): Promise<{ db: AppDb; backups: string }> {
  counter += 1
  const db = createDb(`simpler-day-${counter}`)
  open.push(db)
  const backups = `simpler-day-backups-${counter}`
  await runMigrations({ db, today: "2026-09-01", now: 1, theme: "system" }, { migrations: MIGRATIONS.filter((step) => step.id < "012"), backupName: backups })
  return { db, backups }
}

const run = (db: AppDb, backups: string, today = "2026-10-08") => runMigrations({ db, today, now: 2, theme: "system" }, { backupName: backups })
const byName = async (db: AppDb, name: string) => (await db.habits.toArray()).find((habit) => habit.name.toLowerCase() === name)!

describe("reading and writing leave the list", () => {
  it("retires both from today and keeps their past ticks", async () => {
    const { db, backups } = await before()
    const reading = await byName(db, "reading")
    await setHabitDone(reading.id!, "2026-10-08", true, { today: "2026-10-10", windowDays: 7 }, {}, db)
    await run(db, backups, "2026-10-10")
    expect((await byName(db, "reading")).retired_on).toBe("2026-10-10")
    expect((await byName(db, "writing / reflection")).retired_on).toBe("2026-10-10")
    expect((await byName(db, "meditation (isha kriya)")).retired_on).toBeNull()
    expect(await db.entries.where("habit_id").equals(reading.id!).count()).toBe(1)
  })
})

describe("a cold shower is added", () => {
  it("adds one daily habit under Body, Grooming, tracked from the day it runs, and only once", async () => {
    const { db, backups } = await before()
    await run(db, backups, "2026-10-12")
    const count = await db.habits.count()
    const habit = await byName(db, "cold shower")
    const current = habit.versions[habit.versions.length - 1]
    expect([current.area, current.group, habit.created_on, habit.retired_on]).toEqual(["body", "Grooming", "2026-10-12", null])
    expect((await db.habits.toArray()).filter((row) => row.name === "Cold shower").length).toBe(1)
    await run(db, backups, "2026-10-13")
    expect(await db.habits.count()).toBe(count)
  })
})

describe("today in the order of the day", () => {
  it("renames the moisturiser, adds Haircare, and orders the habits by the day", async () => {
    const { db, backups } = await before()
    await run(db, backups, "2026-10-12")
    expect(await db.habits.toArray().then((all) => all.some((habit) => habit.name === "Daily moisturiser" && habit.retired_on === null))).toBe(false)
    const skincare = await byName(db, "skincare")
    expect(skincare.versions[0].name).toBe("Daily moisturiser")
    expect(await byName(db, "haircare")).toBeTruthy()
    const names = (await db.habits.orderBy("sort_order").toArray()).filter((habit) => habit.retired_on === null).map((habit) => habit.name)
    // The morning the user set out: these lead the list, in this order.
    const morning = ["Wake up at 4:00 AM", "Meditation (Isha Kriya)", "Chia seeds", "Creatine", "Learning", "Gym", "Hanuman Chalisa", "Shiv Tandav Stotram", "Breakfast"]
    expect(names.filter((name) => morning.includes(name))).toEqual(morning)
    expect(names.slice(0, morning.length).every((name) => morning.includes(name) || name.startsWith("Brush"))).toBe(true)
    expect(names.indexOf("Cold shower")).toBeGreaterThan(names.indexOf("Breakfast"))
    expect(names.indexOf("Chia seeds")).toBeLessThan(names.indexOf("Breakfast"))
    expect(names.indexOf("Breakfast")).toBeLessThan(names.indexOf("Lunch"))
    expect(names.indexOf("Lunch")).toBeLessThan(names.indexOf("Dinner"))
    // The evening steps close the day: Dinner, and Sleep where that habit exists.
    expect(["Dinner", "Sleep before 10:00 PM"]).toContain(names[names.length - 1])
    const orders = (await db.habits.toArray()).map((habit) => habit.sort_order)
    expect(new Set(orders).size).toBe(orders.length)
  })
})

describe("a simpler day", () => {
  it("retires Water on waking, Cardio and the Daily 10s from today, and keeps their past", async () => {
    const { db, backups } = await before()
    const pushups = await byName(db, "10 push-ups")
    await setHabitDone(pushups.id!, "2026-10-06", true, { today: "2026-10-08", windowDays: 7 }, {}, db)
    await run(db, backups)
    for (const name of ["water on waking", "cardio", "10 push-ups", "10 crunches", "10 pull-ups"]) {
      expect((await byName(db, name)).retired_on, name).toBe("2026-10-08")
    }
    expect((await byName(db, "gym")).retired_on).toBeNull()
    expect(await db.entries.where("habit_id").equals(pushups.id!).count()).toBe(1)
  })

  it("leaves Gym as the only exercise due", async () => {
    const { db, backups } = await before()
    await run(db, backups)
    const habits = await db.habits.toArray()
    const index = buildCompletionIndex({ entries: await db.entries.toArray(), sessions: await db.sessions.toArray(), learningSessions: await db.learning_sessions.toArray(), journalDates: [] })
    const exercise = dueItems(habits, "2026-10-08", index).filter((item) => item.version.area === "exercise").map((item) => item.habit.name)
    expect(exercise).toEqual(["Gym"])
  })

  it("puts Creatine with the other supplements and retires the day routines", async () => {
    const { db, backups } = await before()
    await run(db, backups)
    const creatine = await byName(db, "creatine")
    const current = creatine.versions[creatine.versions.length - 1]
    expect([current.area, current.group]).toEqual(["body", "Supplements"])
    expect((await db.day_routines.toArray()).every((routine) => routine.retired_on !== null)).toBe(true)
    const vitaminD = await byName(db, "vitamin d")
    expect(vitaminD.versions[vitaminD.versions.length - 1].day).toEqual({ kind: "weekdays", weekdays: [6] })
  })

  it("takes Hair oiling back to 0 for the week it was asked in, and only that week", async () => {
    const { db, backups } = await before()
    const hair = await byName(db, "hair oiling")
    const window = { today: "2026-10-08", windowDays: 14 }
    await setHabitDone(hair.id!, "2026-10-06", true, window, {}, db)
    await setHabitDone(hair.id!, "2026-09-30", true, window, {}, db)
    await run(db, backups)
    const left = (await db.entries.where("habit_id").equals(hair.id!).toArray()).map((row) => row.date)
    expect(left).toEqual(["2026-09-30"])
  })

  it("does not touch a later week when a device first runs it late", async () => {
    const { db, backups } = await before()
    const hair = await byName(db, "hair oiling")
    await setHabitDone(hair.id!, "2026-10-13", true, { today: "2026-10-14", windowDays: 7 }, {}, db)
    await run(db, backups, "2026-10-14")
    expect(await db.entries.where("habit_id").equals(hair.id!).count()).toBe(1)
  })
})
