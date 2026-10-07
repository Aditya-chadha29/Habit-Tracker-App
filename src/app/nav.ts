import type { IconName } from '../ui/icons'
import type { NavId } from './router'

export interface NavItem {
  id: NavId
  label: string
  to: string
  icon: IconName
}

/** The five places the app lives in. Always one tap away: the bottom bar on a phone, the top of
 *  the sidebar on a wide screen. */
export const PRIMARY_NAV: NavItem[] = [
  { id: 'today', label: 'Today', to: '/', icon: 'home' },
  { id: 'learn', label: 'Learn', to: '/learn', icon: 'learn' },
  { id: 'train', label: 'Train', to: '/train', icon: 'train' },
  { id: 'review', label: 'Review', to: '/review', icon: 'review' },
  { id: 'progress', label: 'Progress', to: '/progress', icon: 'progress' },
]

/** Setup and reference. Behind the menu button on a phone, below the divider in the sidebar. */
export const SECONDARY_NAV: NavItem[] = [
  { id: 'journal', label: 'Journal', to: '/journal', icon: 'journal' },
  { id: 'habits', label: 'Habits', to: '/habits', icon: 'habits' },
  { id: 'routines', label: 'Routines', to: '/routines', icon: 'routines' },
  { id: 'quotes', label: 'Quotes', to: '/quotes', icon: 'quotes' },
  { id: 'search', label: 'Search', to: '/search', icon: 'search' },
  { id: 'data', label: 'Data', to: '/data', icon: 'data' },
  { id: 'settings', label: 'Settings', to: '/settings', icon: 'settings' },
]
