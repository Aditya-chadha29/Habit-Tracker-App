import sakuraCorner from '../assets/sakura-corner.webp'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { goBack, useLocation } from '../app/router'
import { useShell } from '../app/Shell'
import { Scene, type SceneName } from '../components/Scene'
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
  /** Scenery behind the screen itself: across the top (under the header) or along the bottom. */
  backdrop?: { scene: SceneName; at: 'top' | 'bottom'; position?: string; /** Leave a clear strip under the header so the picture is seen before the first card. */ reveal?: boolean }
}

/**
 * The frame of every screen: a header that stays put and a body that scrolls.
 *
 * On a phone the header carries either a back arrow (for a screen you drilled into) or the menu
 * button that opens Journal, Habits, Routines, Quotes, Data and Settings. On a wide screen those
 * live in the sidebar, so the header is just the title.
 */
export function Page({ title, subtitle, back, actions, tabs, width = 'default', children, className, backdrop }: PageProps) {
  const { openMenu } = useShell()
  const onScene = backdrop?.at === 'top'
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
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* The scenery behind the screen itself. At the top it runs under the header, which then
          carries night colours; at the bottom it sits behind the last of the page (night only). */}
      {backdrop?.at === 'top' && (
        <div className="absolute inset-x-0 top-0 h-[46%] min-h-[320px] lg:h-[60%]">
          <Scene name={backdrop.scene} fade="top" position={backdrop.position} eager />
        </div>
      )}
      {backdrop?.at === 'bottom' && (
        <div className="scene-night-only absolute inset-x-0 bottom-0 h-[58%]">
          <Scene name={backdrop.scene} fade="bottom" position={backdrop.position} />
        </div>
      )}
      <header className={cx('relative shrink-0 overflow-hidden pt-safe', onScene ? 'bg-transparent' : 'border-b border-line bg-ground')}>
        {/* Held back where buttons sit in the corner, so they are never lost among petals. */}
        {!onScene && (
          <div aria-hidden="true" className={cx('pointer-events-none absolute top-0 right-0', actions ? 'opacity-45' : undefined)}>
            <img src={sakuraCorner} alt="" className="blossom-corner h-[calc(118px+env(safe-area-inset-top,0px))] w-[150px] object-cover object-[78%_18%] lg:h-[150px] lg:w-[210px]" />
          </div>
        )}
        <div className={cx('relative mx-auto flex w-full items-center gap-2 px-2 py-3 lg:px-8 lg:py-5', WIDTH[width])}>
          {back !== undefined ? (
            <IconButton icon="chevron-left" label="Back" onClick={() => goBack(back)} className={onScene ? 'text-night-ink' : undefined} />
          ) : (
            <IconButton icon="menu" label="Menu: every part of the app" onClick={openMenu} className={cx('lg:hidden', onScene && 'text-night-ink')} />
          )}
          <div className={cx('min-w-0 flex-1', back === undefined && 'lg:pl-0')}>
            <h1 className={cx('line-clamp-2 font-display text-[24px] leading-tight font-medium tracking-[0.01em] lg:text-[30px]', onScene ? 'text-night-ink [text-shadow:0_1px_10px_var(--color-night),0_0_2px_var(--color-night)]' : 'text-cream')}>{title}</h1>
            {subtitle && <div className={cx('mt-0.5 truncate text-[12.5px] lg:text-[13.5px]', onScene ? 'text-night-ink [text-shadow:0_1px_8px_var(--color-night),0_0_2px_var(--color-night)]' : 'text-ink-3')}>{subtitle}</div>}
          </div>
          {actions && <div className={cx('flex shrink-0 items-center gap-1.5 pr-2 lg:pr-0', onScene && '[&_button:not([class*=bg-gradient])]:text-night-ink')}>{actions}</div>}
        </div>
        {tabs && <div className={cx('relative mx-auto w-full px-4 pb-3 lg:px-8', WIDTH[width])}>{tabs}</div>}
      </header>
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="min-h-full" style={onScene ? { background: 'linear-gradient(to bottom, transparent 0, transparent 300px, var(--color-ground) 460px)' } : undefined}>
        <div className={cx(// The screen runs to the very bottom of the phone; the last of it clears the home indicator.
          'mx-auto w-full px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] lg:px-8 lg:py-6', WIDTH[width], className)}>
          {onScene && backdrop?.reveal && <div aria-hidden="true" className="h-[92px] lg:h-[150px]" />}
          {children}
        </div>
        </div>
      </div>
    </div>
  )
}
