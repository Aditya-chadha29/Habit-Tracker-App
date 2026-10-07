import { lazy } from 'react'
import type { RouteDef } from '../../app/router'

export const routes: RouteDef[] = [
  { path: '/progress', nav: 'progress', component: lazy(() => import('./ProgressScreen')) },
  { path: '/progress/habit/:id', nav: 'progress', component: lazy(() => import('./HabitHistoryScreen')) },
  { path: '/progress/weight', nav: 'progress', component: lazy(() => import('./WeightScreen')) },
]
