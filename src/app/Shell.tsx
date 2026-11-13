import { createContext, Suspense, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { cx } from '../ui/cx'
import { Icon } from '../ui/icons'
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from './nav'
import { Link, matchRoute, useLocation, type NavId, type RouteDef } from './router'
import { ErrorBoundary } from './ErrorBoundary'

interface ShellValue {
  /** Opens the sheet of secondary destinations (phone only; the sidebar shows them on desktop). */
  openMenu: () => void
}

const ShellContext = createContext<ShellValue>({ openMenu: () => {} })

export function useShell(): ShellValue {
  return useContext(ShellContext)
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-3">
      <img src="/favicon.png" alt="" width="28" height="28" className="h-7 w-7 rounded-lg" />
      <span className="font-display text-[15px] font-semibold tracking-[0.24em] text-cream">IKIKATA</span>
    </div>
  )
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex h-10 items-center gap-3 rounded-control px-3 text-[14px] transition-colors duration-100',
        active ? 'bg-accent/15 font-medium text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
      )}
    >
      <Icon name={item.icon} size={17} className={active ? 'text-accent-ink' : 'text-ink-3'} />
      {item.label}
    </Link>
  )
}

function Sidebar({ current }: { current: NavId | null }) {
  return (
    <aside className="hidden w-[232px] shrink-0 flex-col border-r border-line bg-ground py-5 lg:flex">
      <Brand />
      <nav aria-label="Main" className="mt-6 flex flex-col gap-0.5 px-2">
        {PRIMARY_NAV.map((item) => (
          <SidebarLink key={item.id} item={item} active={current === item.id} />
        ))}
      </nav>
      <div className="mx-4 my-4 border-t border-line" />
      <nav aria-label="Setup and reference" className="flex flex-col gap-0.5 px-2">
        {SECONDARY_NAV.map((item) => (
          <SidebarLink key={item.id} item={item} active={current === item.id} />
        ))}
      </nav>
    </aside>
  )
}

function MenuSheet({ open, current, onClose }: { open: boolean; current: NavId | null; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
      <button
        type="button"
        aria-label="Close menu"
        className="animate-fade-in absolute inset-0 cursor-default bg-black/55"
        onClick={onClose}
      />
      <div className="animate-sheet-up absolute inset-x-0 bottom-0 rounded-t-[20px] bg-surface pb-safe shadow-pop">
        <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-line-strong" aria-hidden="true" />
        <div className="grid grid-cols-3 gap-2 p-4">
          {[...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => {
            const active = current === item.id
            return (
              <Link
                key={item.id}
                to={item.to}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-card text-[13px] transition-colors duration-100',
                  active ? 'bg-accent/15 font-medium text-ink' : 'bg-surface-2 text-ink-2 active:bg-surface-3',
                )}
              >
                <Icon name={item.icon} size={21} className={active ? 'text-accent-ink' : 'text-ink-3'} />
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 pt-safe text-center">
      <p className="text-[15px] text-ink-2">That page does not exist.</p>
      <Link to="/" className="text-[14px] font-medium text-cream underline underline-offset-2">
        Go to Today
      </Link>
    </div>
  )
}

/**
 * The frame every screen sits in: a sidebar on wide screens; on a phone, one menu behind the
 * grid button at the top left of every main screen (the user chose this over a bottom bar).
 * Only the screen for the current URL is mounted.
 */
export function Shell({ routes, fallback }: { routes: readonly RouteDef[]; fallback?: ReactNode }) {
  const { path } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const match = matchRoute(path, routes)
  const current = match?.route.nav ?? null
  const shell = useMemo<ShellValue>(() => ({ openMenu: () => setMenuOpen(true) }), [])

  // A navigation always closes the menu, including one made with the browser's back button.
  useEffect(() => {
    setMenuOpen(false)
  }, [path])

  const Screen = match?.route.component

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex h-dvh w-full overflow-hidden bg-ground text-ink">
        <Sidebar current={current} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex min-h-0 flex-1 flex-col">
            <ErrorBoundary key={path}>
              <Suspense fallback={fallback ?? null}>
                {Screen && match ? <Screen params={match.params} /> : <NotFound />}
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
        <MenuSheet open={menuOpen} current={current} onClose={() => setMenuOpen(false)} />
      </div>
    </ShellContext.Provider>
  )
}
