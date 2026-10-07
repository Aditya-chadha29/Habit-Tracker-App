import { lazy } from 'react'
import type { RouteDef } from '../../app/router'

const ReviewScreen = lazy(() => import('./ReviewScreen'))

export const routes: RouteDef[] = [
  { path: '/review', nav: 'review', component: ReviewScreen },
  { path: '/review/:weekStart', nav: 'review', component: ReviewScreen },
]
