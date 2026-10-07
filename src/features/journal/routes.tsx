import { lazy } from 'react'
import type { RouteDef } from '../../app/router'

export const routes: RouteDef[] = [
  { path: '/journal', nav: 'journal', component: lazy(() => import('./JournalScreen')) },
  { path: '/journal/history', nav: 'journal', component: lazy(() => import('./JournalHistoryScreen')) },
]
