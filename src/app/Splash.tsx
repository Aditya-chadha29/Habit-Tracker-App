import { useEffect, useState } from 'react'
import { Scene } from '../components/Scene'
import { toLocalDateStr } from '../engine/dates'
import { cx } from '../ui/cx'

/**
 * The name, quietly, over the lake. Shown while the record is being read, and for a moment each
 * time the app is opened. `quiet` leaves out the "Loading" line when nothing is being waited for.
 */
export function Splash({ quiet = false }: { quiet?: boolean }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-end overflow-hidden bg-night pb-[13vh]">
      <Scene name="torii" fade="splash" position="50% 40%" eager />
      <div className="relative flex flex-col items-center gap-3 px-8 text-center">
        <p className="font-display text-[30px] font-medium tracking-[0.32em] text-night-ink">IKIKATA</p>
        <span aria-hidden="true" className="h-px w-10 bg-accent" />
        <p className="text-[13px] tracking-[0.06em] text-night-ink/80">Your way of life.</p>
        {!quiet && (
          <p role="status" className="mt-6 text-[12.5px] text-night-ink/60">
            Loading your data…
          </p>
        )}
      </div>
    </div>
  )
}

/** How long the opening screen stays before it gives way to the app. */
const OPENING_MS = 1600
const FADE_MS = 450

const OPENED_KEY = 'ikikata-opened-on'

/** True the first time the app is opened on a day; remembers that it has been. */
function firstOpeningToday(): boolean {
  const today = toLocalDateStr(new Date())
  try {
    if (localStorage.getItem(OPENED_KEY) === today) return false
    localStorage.setItem(OPENED_KEY, today)
  } catch {
    // Storage blocked: show it, as before.
  }
  return true
}

/** Decided once per launch, so a re-render can never change the answer. */
const SHOW_OPENING = firstOpeningToday()

/**
 * The opening screen: shown the first time the app is opened each day, over the app as it gets
 * ready underneath, then faded away. A tap dismisses it at once for anyone who does not want to
 * wait.
 */
export function Opening() {
  const [phase, setPhase] = useState<'showing' | 'leaving' | 'gone'>(SHOW_OPENING ? 'showing' : 'gone')

  useEffect(() => {
    if (phase === 'gone') return
    const timer = setTimeout(() => setPhase(phase === 'showing' ? 'leaving' : 'gone'), phase === 'showing' ? OPENING_MS : FADE_MS)
    return () => clearTimeout(timer)
  }, [phase])

  if (phase === 'gone') return null
  return (
    <div
      aria-hidden="true"
      onClick={() => setPhase('gone')}
      className={cx('fixed inset-0 z-50 transition-opacity ease-out', phase === 'leaving' && 'pointer-events-none opacity-0')}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <Splash quiet />
    </div>
  )
}
