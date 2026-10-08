import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { goBack, useLocation } from '../app/router'
import { useShell } from '../app/Shell'
import { IconButton } from './Button'
import { cx } from './cx'

type Width = 'narrow' | 'default' | 'wide'

const WIDTH: Record<Width, string> = {
  narrow: 'max-w-[680px]',
  default: 'max-w-[980px]',
  wide: 'max-w-[1240px]',
}

/** Where each screen was scrolled to, so coming Back lands where you left. In memory only. */
const scrollMemory = new Map<string, number>()

interface PageProps {
  title: string
  /** One quiet line under the title: a date, a count, what the screen is for. */
  subtitle?: ReactNode
  /**
   * For a screen reached FROM another screen: the path to return to if there is no history
   * (a deep link opened cold). Shows a back arrow instead of the menu button.
   */
  back?: string
  /** Buttons at the right of the header. Keep to one or two; the rest belong in the page. */
  actions?: ReactNode
  /** A tab strip or segmented control pinned under the title. */
  tabs?: ReactNode
  /** narrow: reading and forms. default: most screens. wide: dashboards that use columns. */
  width?: Width
  children: ReactNode
  /** Extra classes for the content container (e.g. a grid). */
  className?: string
}

/**
 * The frame of every screen: a header that stays put and a body that scrolls.
 *
 * On a phone the header carries either a back arrow (for a screen you drilled into) or the menu
 * button that opens Journal, Habits, Routines, Quotes, Data and Settings. On a wide screen those
 * live in the sidebar, so the header is just the title.
 */
export function Page({ title, subtitle, back, actions, tabs, width = 'default', children, className }: PageProps) {
  const { openMenu } = useShell()
  const { path } = useLocation()
  const scroller = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return
    element.scrollTop = scrollMemory.get(path) ?? 0
    return () => {
      scrollMemory.set(path, element.scrollTop)
    }
  }, [path])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-line bg-ground">
        <div className={cx('mx-auto flex w-full items-center gap-2 px-2 py-2 lg:px-8 lg:py-5', WIDTH[width])}>
          {back !== undefined ? (
            <IconButton icon="chevron-left" label="Back" onClick={() => goBack(back)} />
          ) : (
            <IconButton icon="menu" label="More: journal, habits, routines, quotes, data, settings" onClick={openMenu} className="lg:hidden" />
          )}
          <div className={cx('min-w-0 flex-1', back === undefined && 'lg:pl-0')}>
            <h1 className="truncate font-display text-[19px] leading-tight font-semibold tracking-[0.01em] text-cream lg:text-[26px]">{title}</h1>
            {subtitle && <div className="mt-0.5 truncate text-[12.5px] text-ink-3 lg:text-[13.5px]">{subtitle}</div>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5 pr-2 lg:pr-0">{actions}</div>}
        </div>
        {tabs && <div className={cx('mx-auto w-full px-4 pb-3 lg:px-8', WIDTH[width])}>{tabs}</div>}
      </header>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className={cx(// The screen runs to the very bottom of the phone; the last of it clears the home indicator.
          'mx-auto w-full px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] lg:px-8 lg:py-6', WIDTH[width], className)}>{children}</div>
      </div>
    </div>
  )
}
