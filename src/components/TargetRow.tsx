import { toggleHabit } from '../data/habitRepo'
import type { Habit } from '../data/types'
import { completedBy } from '../engine/completion'
import { clockHHMM } from '../engine/dates'
import { describeTarget, targetStateWord } from '../engine/describe'
import type { TargetProgress, TargetState } from '../engine/targets'
import { nameOn, versionOn } from '../engine/timeline'
import { useCore } from '../state/core'
import type { Tone } from '../ui/Chip'
import { cx } from '../ui/cx'
import { ProgressBar } from '../ui/Progress'
import { Tick } from '../ui/Tick'
import { useToast } from '../ui/Toast'

const TONE: Record<TargetState, Tone> = {
  met: 'ok',
  on_track: 'accent',
  attention: 'warn',
  at_risk: 'risk',
  unreachable: 'warn',
  missed: 'risk',
  partial: 'neutral',
  upcoming: 'neutral',
}

const WORD_CLASS: Record<Tone, string> = {
  neutral: 'text-ink-3',
  accent: 'text-ink-2',
  ok: 'text-ok',
  warn: 'text-warn',
  risk: 'text-risk',
  mind: 'text-mind',
  body: 'text-body',
  learning: 'text-learning',
  exercise: 'text-exercise',
}

interface TargetRowProps {
  habit: Habit
  progress: TargetProgress
  /** Show a tick for doing it today. Only meaningful for the running period. */
  tickable?: boolean
  /** Leave out the sentence under the bar, for dense lists. */
  compact?: boolean
}

/**
 * A weekly or monthly target: the name, "1 / 2", a bar, and one factual line about where it
 * stands. The state is always in words as well as colour.
 */
export function TargetRow({ habit, progress, tickable = false, compact = false }: TargetRowProps) {
  const { today, index, write } = useCore()
  const toast = useToast()
  // A daily habit that has missed a day cannot reach 7 of 7; that is a fact, not a warning.
  const tone = progress.state === 'unreachable' && !progress.flexible ? 'accent' : TONE[progress.state]
  const name = nameOn(habit, progress.period.end < today ? progress.period.end : today)
  const version = versionOn(habit, today)
  const canTick = tickable && !!version?.active && version.sources.includes('manual')
  const doneToday = completedBy(habit, today, index) !== null

  const tick = () => {
    toggleHabit(habit.id!, today, write, { time: clockHHMM(new Date()) }).catch((error: unknown) => {
      toast.show(error instanceof Error ? error.message : 'That could not be saved.', { tone: 'risk' })
    })
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink">{name}</span>
          <span className="tnum shrink-0 text-[13.5px] font-medium text-ink">
            {progress.done} / {progress.target}
          </span>
        </div>
        <ProgressBar
          value={Math.min(progress.done, progress.target)}
          max={progress.target}
          tone={tone}
          label={`${name}: ${progress.done} of ${progress.target}`}
          className="mt-2"
        />
        {!compact && (
          <p className={cx('mt-1.5 text-[12.5px]', WORD_CLASS[tone])}>
            <span className="sr-only">{targetStateWord(progress)}: </span>
            {describeTarget(progress)}
          </p>
        )}
      </div>
      {canTick && <Tick checked={doneToday} onChange={tick} label={`${name}, done today`} />}
    </div>
  )
}
