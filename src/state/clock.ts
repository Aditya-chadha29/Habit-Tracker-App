import { useEffect, useState } from 'react'
import type { DateStr } from '../data/types'
import { logicalDate } from '../engine/dates'

export interface Clock {
  /** The calendar day it is, honouring the configured day start. */
  today: DateStr
  /** Local hour, 0–23. Used only to decide whether it is "late in the day". */
  hour: number
}

function read(dayStartHour: number): Clock {
  const now = new Date()
  return { today: logicalDate(now, dayStartHour), hour: now.getHours() }
}

/**
 * The app's sense of "now", in one place.
 *
 * It re-reads the clock when the app comes back to the foreground and once a minute while it is
 * open, so an installed app resumed the next morning rolls over to the new day on its own —
 * nothing is "reset"; yesterday simply becomes history.
 */
export function useClock(dayStartHour: number): Clock {
  const [clock, setClock] = useState(() => read(dayStartHour))

  useEffect(() => {
    const refresh = () => {
      const next = read(dayStartHour)
      setClock((current) => (current.today === next.today && current.hour === next.hour ? current : next))
    }
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [dayStartHour])

  return clock
}
