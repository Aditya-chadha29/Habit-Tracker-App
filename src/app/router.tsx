import {
  useSyncExternalStore, type AnchorHTMLAttributes, type ComponentType, type LazyExoticComponent,
  type ReactNode,
} from 'react'

/**
 * A hash router, small enough to read in one sitting.
 *
 * Hash URLs (`#/learn/queue`) need no server rewrite rules, survive being opened offline from the
 * home screen, and give the browser's own back button and history for free. State that should
 * survive a reload or a back-swipe — which tab, which week, which resource — lives in the URL.
 */
export type NavId =
  | 'today' | 'learn' | 'train' | 'review' | 'progress'
  | 'journal' | 'habits' | 'routines' | 'quotes' | 'search' | 'data' | 'settings'

export interface RouteProps {
  /** Values of the `:name` segments in the route's path. */
  params: Record<string, string>
}

export interface RouteDef {
  /** e.g. '/learn/resource/:id'. Matched segment by segment; no wildcards. */
  path: string
  /** Which navigation item is highlighted while this route is showing. */
  nav: NavId
  component: LazyExoticComponent<ComponentType<RouteProps>> | ComponentType<RouteProps>
}

function readLocation(): string {
  const hash = window.location.hash.replace(/^#/, '')
  return hash.startsWith('/') ? hash : '/'
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

/** How many in-app navigations deep we are, so Back knows whether there is anywhere to go. */
let depth = 0

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === readLocation()) return
  if (options.replace) {
    window.location.replace(`#${to}`)
  } else {
    depth += 1
    window.location.hash = to
  }
}

/** Goes back if this session navigated here; otherwise goes to `fallback` — which is what makes
 *  a deep link opened cold still have a working back button. */
export function goBack(fallback: string): void {
  if (depth > 0) {
    depth -= 1
    window.history.back()
  } else {
    navigate(fallback, { replace: true })
  }
}

export interface Location {
  /** Path without the query, e.g. '/learn/resource/12'. */
  path: string
  query: URLSearchParams
}

export function parseLocation(raw: string): Location {
  const [path, search = ''] = raw.split('?')
  return { path: path.replace(/\/+$/, '') || '/', query: new URLSearchParams(search) }
}

export function useLocation(): Location {
  const raw = useSyncExternalStore(subscribe, readLocation, () => '/')
  return parseLocation(raw)
}

/** One query value from the URL, with a setter that replaces rather than pushes history. */
export function useQueryState(key: string, fallback: string): [string, (value: string) => void] {
  const { path, query } = useLocation()
  const value = query.get(key) ?? fallback
  const setValue = (next: string) => {
    const params = new URLSearchParams(query)
    if (next === fallback) params.delete(key)
    else params.set(key, next)
    const search = params.toString()
    navigate(search ? `${path}?${search}` : path, { replace: true })
  }
  return [value, setValue]
}

export function matchRoute(
  path: string,
  routes: readonly RouteDef[],
): { route: RouteDef; params: Record<string, string> } | null {
  const segments = path.split('/').filter(Boolean)
  for (const route of routes) {
    const pattern = route.path.split('/').filter(Boolean)
    if (pattern.length !== segments.length) continue
    const params: Record<string, string> = {}
    const matches = pattern.every((part, i) => {
      if (part.startsWith(':')) {
        params[part.slice(1)] = decodeURIComponent(segments[i])
        return true
      }
      return part === segments[i]
    })
    if (matches) return { route, params }
  }
  return null
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string
  children: ReactNode
}

/** A real anchor, so it can be focused, middle-clicked and long-pressed like any link. */
export function Link({ to, children, onClick, ...rest }: LinkProps) {
  return (
    <a
      href={`#${to}`}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return
        event.preventDefault()
        navigate(to)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}
