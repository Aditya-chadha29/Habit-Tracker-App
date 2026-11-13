import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './icons'

interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Element to render: a list of cards should be `li`s, a standalone region a `section`. */
  as?: 'div' | 'section' | 'article' | 'li'
  /** Default padding. Turn off for a card whose content is a flush list of rows. */
  padded?: boolean
  children: ReactNode
}

/** The one surface things sit on. Flat in dark (a hairline, no shadow), barely lifted in light. */
export function Card({ as: Tag = 'div', padded = true, className, children, ...rest }: CardProps) {
  return (
    <Tag className={cx('rounded-card bg-surface shadow-card', padded && 'p-4', className)} {...rest}>
      {children}
    </Tag>
  )
}

interface CardHeaderProps {
  title: string
  subtitle?: string
  icon?: IconName
  /** Tints the icon: one of the pillar or status colour utilities, e.g. 'text-mind'. */
  iconClassName?: string
  /** Sits at the right edge: a count, a link, a button. */
  action?: ReactNode
  className?: string
}

export function CardHeader({ title, subtitle, icon, iconClassName, action, className }: CardHeaderProps) {
  return (
    <div className={cx('flex items-center gap-3', className)}>
      {icon && <Icon name={icon} size={18} className={iconClassName ?? 'text-ink-3'} />}
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-display text-[16px] leading-tight font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 text-[13px] text-ink-2">{action}</div>}
    </div>
  )
}

/** The small uppercase label that introduces a group of cards or rows. */
export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-end justify-between gap-3 px-1', className)}>
      <h2 className="eyebrow">{children}</h2>
      {action && <div className="text-[13px] text-cream underline underline-offset-2">{action}</div>}
    </div>
  )
}
