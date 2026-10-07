import { Link } from '../app/router'
import type { AttentionItem, AttentionLevel } from '../engine/attention'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/icons'

const LEVEL: Record<AttentionLevel, { icon: IconName; tone: string; tint: string; word: string }> = {
  at_risk: { icon: 'alert', tone: 'text-risk', tint: 'bg-risk/12', word: 'At risk' },
  missed: { icon: 'alert-circle', tone: 'text-risk', tint: 'bg-risk/12', word: 'Missed' },
  attention: { icon: 'alert', tone: 'text-warn', tint: 'bg-warn/12', word: 'Attention' },
  normal: { icon: 'info', tone: 'text-ink-2', tint: 'bg-surface-2', word: 'Note' },
}

/**
 * The short list of things worth pointing out. Each line carries its level as a word and an
 * icon, never as colour alone, and goes somewhere useful when tapped.
 */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (!items.length) return null
  return (
    <section aria-labelledby="attention-heading" className="flex flex-col gap-2">
      <h2 id="attention-heading" className="eyebrow px-1">
        Needs attention
      </h2>
      <Card as="div" padded={false} className="overflow-hidden">
        <ul className="divide-y divide-line">
          {items.map((item) => {
            const level = LEVEL[item.level]
            return (
              <li key={item.id}>
                <Link
                  to={item.to}
                  className="flex min-h-[60px] items-center gap-3 px-4 py-2.5 transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3"
                >
                  <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-control', level.tint, level.tone)}>
                    <Icon name={level.icon} size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 truncate text-[14.5px] font-medium text-ink">{item.title}</span>
                      <span className={cx('shrink-0 text-[11px] font-semibold tracking-wide uppercase', level.tone)}>{level.word}</span>
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">{item.detail}</span>
                  </span>
                  <Icon name="chevron-right" size={17} className="shrink-0 text-ink-3" />
                </Link>
              </li>
            )
          })}
        </ul>
      </Card>
    </section>
  )
}
