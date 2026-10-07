import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './icons'

interface EmptyStateProps {
  icon?: IconName
  /** What is empty, in a few words. */
  title: string
  /** One sentence at most: what would fill it. */
  body?: string
  /** The one action that fixes it. */
  action?: ReactNode
  className?: string
}

/** Says what is empty and offers the one thing that fixes it. No tutorials, no illustrations. */
export function EmptyState({ icon, title, body, action, className }: EmptyStateProps) {
  return (
    <div className={cx('flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-10 text-center shadow-card', className)}>
      {icon && (
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink-3">
          <Icon name={icon} size={20} />
        </span>
      )}
      <div>
        <p className="text-[15px] font-medium text-ink">{title}</p>
        {body && <p className="mx-auto mt-1 max-w-[44ch] text-[13.5px] leading-relaxed text-ink-3">{body}</p>}
      </div>
      {action}
    </div>
  )
}
