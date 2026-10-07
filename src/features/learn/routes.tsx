import { lazy } from 'react'
import type { RouteDef } from '../../app/router'

export const routes: RouteDef[] = [
  { path: '/learn', nav: 'learn', component: lazy(() => import('./LearnTodayScreen')) },
  { path: '/learn/queue', nav: 'learn', component: lazy(() => import('./QueueScreen')) },
  { path: '/learn/library', nav: 'learn', component: lazy(() => import('./LibraryScreen')) },
  { path: '/learn/reading', nav: 'learn', component: lazy(() => import('./ReadingScreen')) },
  { path: '/learn/resource/:id', nav: 'learn', component: lazy(() => import('./ResourceScreen')) },
]
