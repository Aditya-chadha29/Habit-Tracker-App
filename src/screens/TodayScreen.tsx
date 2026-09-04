import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { Check } from 'lucide-react'
import { activeHabits, computeScore, historyDayCount, isDone, type DoneMap } from '../lib/derive'
import { addDays, formatDayTitle, todayLocalStr } from '../lib/dates'
import { toggleEntry } from '../lib/mutations'
import { useFlashOnTrue, usePulseOnChange } from '../lib/hooks'
import { quoteForDate } from '../lib/quotes'
import type { Habit } from '../lib/types'

const TodayRow = memo(function TodayRow({
  habit,
  done,
  pending,
  onTap,
}: {
  habit: Habit
  done: boolean
  pending: boolean
  onTap: (habit: Habit, rowEl: HTMLElement) => void
}) {
  const flashing = useFlashOnTrue(done)
  const stateLabel = done
    ? habit.polarity === 'abstain'
      ? 'held'
      : 'done'
    : pending
      ? 'pending'
      : habit.polarity === 'abstain'
        ? 'broken'
        : 'missed'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => onTap(habit, e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onTap(habit, e.currentTarget)
      }}
      className={`relative flex min-h-[46px] cursor-pointer items-center gap-3 overflow-hidden border-b border-ink/9 px-4 transition-colors duration-100 active:bg-gold/12 ${
        done ? 'bg-gold/6' : ''
      }`}
    >
      {flashing && (
        <div className="animate-row-sweep pointer-events-none absolute inset-y-0 left-0 bg-gold/14" />
      )}
      <div
        className={`relative flex h-5 w-5 flex-none items-center justify-center rounded-[2px] border transition-colors duration-100 ${
          done ? 'border-gold bg-gold active:bg-gold-pressed' : 'border-ink/32 bg-transparent active:bg-gold/12'
        } ${flashing ? 'animate-tick-pop' : ''}`}
      >
        {done && (
          <Check
            size={12}
            strokeWidth={3.2}
            className={`text-on-gold ${flashing ? 'animate-tick-check' : ''}`}
          />
        )}
      </div>
      <div className="relative min-w-0 flex-1">
        <div
          className={`overflow-hidden text-ellipsis whitespace-nowrap text-[14px] leading-[1.25] ${
            done ? 'text-ink' : 'text-ink/72'
          }`}
        >
          {habit.name}
        </div>
      </div>
      <div
        className={`relative flex-none text-[9.5px] tracking-[0.1em] uppercase ${
          done ? 'text-gold/85' : pending ? 'text-ink/30' : 'text-ink/50'
        }`}
      >
        {stateLabel}
      </div>
    </div>
  )
})

type FlyItem = { id: number; x0: number; y0: number; x1: number; y1: number }

export function TodayScreen({ habits, doneMap }: { habits: Habit[]; doneMap: DoneMap }) {
  const [dayOffset, setDayOffset] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const counterRef = useRef<HTMLSpanElement>(null)
  const [listRef] = useAutoAnimate<HTMLDivElement>({ duration: 220, easing: 'ease-out' })
  const [flying, setFlying] = useState<FlyItem[]>([])
  const flyIdRef = useRef(0)

  // iOS Safari can get an inner overflow:auto region "stuck" — the container's internal scroll
  // state gets confused when its content set changes size while scrolled, and the whole app frame
  // starts panning instead of just this list. Resetting scroll position on date navigation is
  // both better UX (view a new day from the top) and avoids leaving the container in whatever
  // mid-scroll state triggers it.
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0)
  }, [dayOffset])

  const today = todayLocalStr()
  const dateStr = addDays(today, dayOffset)
  const isTodayDate = dayOffset === 0
  const active = activeHabits(habits, dateStr)
  const score = computeScore(habits, doneMap, dateStr)
  const scorePct = score.total ? Math.round((score.done / score.total) * 100) : 0
  const historyCount = historyDayCount(habits, today)
  const showFirstDayNote = isTodayDate && historyCount <= 1
  const scorePulse = usePulseOnChange(score.done)
  const quote = quoteForDate(today)

  const ordered = isTodayDate
    ? [...active].sort((a, b) => {
        const aPending = !isDone(doneMap, a.id!, dateStr)
        const bPending = !isDone(doneMap, b.id!, dateStr)
        if (aPending === bPending) return 0
        return aPending ? -1 : 1
      })
    : active

  function handleTap(habit: Habit, rowEl: HTMLElement) {
    const wasDone = isDone(doneMap, habit.id!, dateStr)
    if (!wasDone && counterRef.current && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
      const from = rowEl.getBoundingClientRect()
      const to = counterRef.current.getBoundingClientRect()
      const id = ++flyIdRef.current
      setFlying((f) => [
        ...f,
        {
          id,
          x0: from.left + 16,
          y0: from.top + from.height / 2,
          x1: to.left + to.width / 2,
          y1: to.top + to.height / 2,
        },
      ])
      setTimeout(() => setFlying((f) => f.filter((it) => it.id !== id)), 460)
    }
    toggleEntry(habit.id!, dateStr)
  }

  const daySub = isTodayDate ? 'Today' : dayOffset === -1 ? 'Yesterday' : `${Math.abs(dayOffset)} days back`

  return (
    <>
      <header className="border-b border-ink/14 px-4 pt-2 pb-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={dayOffset <= -6}
            onClick={() => setDayOffset((o) => Math.max(-6, o - 1))}
            className={`h-11 w-11 border-0 bg-transparent font-heading text-[22px] transition-colors duration-100 ${
              dayOffset > -6 ? 'cursor-pointer text-gold active:text-gold-pressed' : 'text-ink/18'
            }`}
          >
            ‹
          </button>
          <div className="text-center">
            <div className="font-heading text-[18px] tracking-[0.01em]">{formatDayTitle(dateStr)}</div>
            <div className="mt-0.5 text-[10.5px] tracking-[0.12em] text-ink/45 uppercase">{daySub}</div>
          </div>
          <button
            type="button"
            disabled={dayOffset >= 0}
            onClick={() => setDayOffset((o) => Math.min(0, o + 1))}
            className={`h-11 w-11 border-0 bg-transparent font-heading text-[22px] transition-colors duration-100 ${
              dayOffset < 0 ? 'cursor-pointer text-gold active:text-gold-pressed' : 'text-ink/18'
            }`}
          >
            ›
          </button>
        </div>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span
            ref={counterRef}
            className={`tnum inline-block font-heading text-[36px] leading-none ${scorePulse ? 'animate-number-pulse' : ''}`}
          >
            {score.done}/{score.total}
          </span>
          <span className="text-[11.5px] text-ink/50">{isTodayDate ? 'so far' : 'recorded'}</span>
        </div>
        <div className="mt-2.5 h-0.5 bg-ink/12">
          <div className="h-0.5 bg-gold transition-[width] duration-300 ease-out" style={{ width: `${scorePct}%` }} />
        </div>
        {isTodayDate && (
          <p className="mt-2.5 font-heading text-[12.5px] leading-[1.4] text-ink/50 italic">
            “{quote.text}” <span className="not-italic text-ink/35">— {quote.attribution}</span>
          </p>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        {showFirstDayNote && (
          <div className="border-b border-ink/14 px-4 py-3 text-[11.5px] leading-normal text-ink/50">
            First day logged. Nothing to compare against yet — Insights unlocks as history accumulates.
          </div>
        )}
        <div ref={listRef}>
          {ordered.map((habit) => {
            const done = isDone(doneMap, habit.id!, dateStr)
            const pending = isTodayDate && !done
            return (
              <TodayRow
                key={habit.id}
                habit={habit}
                done={done}
                pending={pending}
                onTap={handleTap}
              />
            )
          })}
        </div>
      </div>

      {flying.map((f) => (
        <div
          key={f.id}
          className="animate-fly-xp pointer-events-none fixed z-50 font-heading text-[13px] text-gold"
          style={
            {
              left: 0,
              top: 0,
              '--fly-x0': `${f.x0}px`,
              '--fly-y0': `${f.y0}px`,
              '--fly-x1': `${f.x1}px`,
              '--fly-y1': `${f.y1}px`,
            } as CSSProperties
          }
        >
          +1
        </div>
      ))}
    </>
  )
}
