import { lazy } from 'react'
import type { RouteDef } from '../../app/router'

export const routes: RouteDef[] = [
  // Learn is the topics, and inside each topic what is saved under it. The queue, library and
  // reading screens are kept, unlinked.
  { path: '/learn', nav: 'learn', component: lazy(() => import('./PillarsScreen')) },
  { path: '/learn/topic/:id', nav: 'learn', component: lazy(() => import('./TopicScreen')) },
  { path: '/learn/today', nav: 'learn', component: lazy(() => import('./LearnTodayScreen')) },
  { path: '/learn/queue', nav: 'learn', component: lazy(() => import('./QueueScreen')) },
  { path: '/learn/library', nav: 'learn', component: lazy(() => import('./LibraryScreen')) },
  { path: '/learn/reading', nav: 'learn', component: lazy(() => import('./ReadingScreen')) },
  { path: '/learn/resource/:id', nav: 'learn', component: lazy(() => import('./ResourceScreen')) },
]
