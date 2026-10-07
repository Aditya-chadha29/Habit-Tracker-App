import { lazy } from 'react'
import type { RouteDef } from '../../app/router'

export const routes: RouteDef[] = [
  // For now Learn is the pillars alone. The queue, library and reading screens are kept, unlinked,
  // until the user decides what Learn should hold next.
  { path: '/learn', nav: 'learn', component: lazy(() => import('./PillarsScreen')) },
  { path: '/learn/today', nav: 'learn', component: lazy(() => import('./LearnTodayScreen')) },
  { path: '/learn/queue', nav: 'learn', component: lazy(() => import('./QueueScreen')) },
  { path: '/learn/library', nav: 'learn', component: lazy(() => import('./LibraryScreen')) },
  { path: '/learn/reading', nav: 'learn', component: lazy(() => import('./ReadingScreen')) },
  { path: '/learn/resource/:id', nav: 'learn', component: lazy(() => import('./ResourceScreen')) },
]
