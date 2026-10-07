import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './icons'

/** The semantic colours of the app. Status tones are always paired with a word or an icon. */
export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'risk' | 'mind' | 'body' | 'learning' | 'exercise'

// Written out in full: Tailwind only generates classes it can see as whole strings.
const TEXT: Record<Tone, string> = {
  neutral: 'text-ink-2',
  accent: 'text-accent-ink',
  ok: 'text-ok',
  warn: 'text-warn',
  risk: 'text-risk',
  mind: 'text-mind',
  body: 'text-body',
  learning: 'text-learning',
  exercise: 'text-exercise',
}

const SOFT: Record<Tone, string> = {
  neutral: 'bg-surface-2',
  accent: 'bg-accent/15',
  ok: 'bg-ok/12',
  warn: 'bg-warn/12',
  risk: 'bg-risk/12',
  mind: 'bg-mind/12',
  body: 'bg-body/12',
  learning: 'bg-learning/12',
  exercise: 'bg-exercise/12',
}

const SOLID: Record<Tone, string> = {
  neutral: 'bg-ink-3',
  accent: 'bg-accent',
  ok: 'bg-ok',
  warn: 'bg-warn',
  risk: 'bg-risk',
  mind: 'bg-mind',
  body: 'bg-body',
  learning: 'bg-learning',
  exercise: 'bg-exercise',
}

const STROKE: Record<Tone, string> = {
  neutral: 'stroke-ink-3',
  accent: 'stroke-accent',
  ok: 'stroke-ok',
  warn: 'stroke-warn',
  risk: 'stroke-risk',
  mind: 'stroke-mind',
  body: 'stroke-body',
  learning: 'stroke-learning',
  exercise: 'stroke-exercise',
}

/** Text colour for a tone. */
export function toneText(tone: Tone): string {
  return TEXT[tone]
}

/** A soft tinted background for a tone. */
export function toneBg(tone: Tone): string {
  return SOFT[tone]
}

/** A filled background for a tone (bars, dots). */
export function toneSolid(tone: Tone): string {
  return SOLID[tone]
}

/** SVG stroke colour for a tone. */
export function toneStroke(tone: Tone): string {
  return STROKE[tone]
}

const KNOWN = new Set<string>(['mind', 'body', 'learning', 'exercise', 'accent', 'ok', 'warn', 'risk', 'neutral'])

/** The tone for a pillar's stored colour name; anything unknown falls back to the accent. */
export function areaTone(color: string): Tone {
  return KNOWN.has(color) ? (color as Tone) : 'accent'
}

interface ChipProps {
  tone?: Tone
  icon?: IconName
  children: ReactNode
  className?: string
}

/** A small label: a status, a type, a pillar. */
export function Chip({ tone = 'neutral', icon, children, className }: ChipProps) {
  return (
    <span
      className={cx(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium whitespace-nowrap',
        SOFT[tone],
        TEXT[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  )
}
