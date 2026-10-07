import { lazy } from 'react'
import type { RouteDef } from '../../app/router'

export const routes: RouteDef[] = [
  { path: '/progress', nav: 'review', component: lazy(() => import('./ProgressScreen')) },
  { path: '/progress/habit/:id', nav: 'review', component: lazy(() => import('./HabitHistoryScreen')) },
  { path: '/progress/weight', nav: 'review', component: lazy(() => import('./WeightScreen')) },
]
