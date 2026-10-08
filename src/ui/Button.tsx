import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './icons'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-gradient-to-r from-accent to-accent-ink text-on-accent shadow-glow hover:from-accent-pressed hover:to-accent active:from-accent-pressed active:to-accent',
  secondary: 'bg-surface-2 text-ink hover:bg-surface-3 active:bg-surface-3 shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
  ghost: 'bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3',
  danger: 'bg-risk/12 text-risk hover:bg-risk/20 active:bg-risk/25 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-risk)_35%,transparent)]',
}

// Heights: md and lg meet the 44px touch-target floor. sm (36px) is for dense desktop toolbars
// and must never be the only way to do something on a phone.
const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5',
  md: 'h-11 px-4 text-[14px] gap-2',
  lg: 'h-13 px-5 text-[15px] gap-2',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: IconName
  /** Stretch to the full width of the container. */
  block?: boolean
  children: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  block = false,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-control font-medium whitespace-nowrap transition-colors duration-100',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANT[variant],
        SIZE[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
    </button>
  )
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName
  /** What the button does, for screen readers and the tooltip. Required: an icon alone says nothing. */
  label: string
  variant?: Variant
  /** md = 44px (default, touch-safe); sm = 36px for dense desktop rows. */
  size?: 'sm' | 'md'
}

export function IconButton({ icon, label, variant = 'ghost', size = 'md', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-control transition-colors duration-100',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANT[variant],
        size === 'md' ? 'h-11 w-11' : 'h-9 w-9',
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={size === 'md' ? 19 : 16} />
    </button>
  )
}
