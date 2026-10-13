import { useSyncExternalStore } from "react"

/**
 * The learning timer: which item is being studied right now and since when. It is kept on this
 * device only and is not part of the record. What goes into the record is the session that is
 * logged when the timer is stopped.
 */
export interface RunningTimer {
  resourceId: number
  startedAt: number
}

const KEY = "ikikata-learn-timer"

function read(): RunningTimer | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<RunningTimer> | null
    return raw && typeof raw.resourceId === "number" && typeof raw.startedAt === "number" ? { resourceId: raw.resourceId, startedAt: raw.startedAt } : null
  } catch {
    return null
  }
}

let current: RunningTimer | null = typeof localStorage === "undefined" ? null : read()
const listeners = new Set<() => void>()

function set(next: RunningTimer | null): void {
  current = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    // Kept for this visit only.
  }
  for (const listener of listeners) listener()
}

/** Starts timing an item. If that item is already being timed, the clock is left running. */
export function startTimer(resourceId: number, now: number): void {
  if (current?.resourceId === resourceId) return
  set({ resourceId, startedAt: now })
}

/** Stops the clock and returns what was running, so its length can be logged. */
export function stopTimer(): RunningTimer | null {
  const was = current
  set(null)
  return was
}

/** Whole minutes, never less than one: a session that was started counts for something. */
export function minutesSince(startedAt: number, now: number): number {
  return Math.max(1, Math.round((now - startedAt) / 60000))
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLearnTimer(): RunningTimer | null {
  return useSyncExternalStore(subscribe, () => current)
}
