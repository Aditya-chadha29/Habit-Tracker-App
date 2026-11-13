import { lazy } from 'react'
import type { RouteDef } from '../../app/router'

const ReviewScreen = lazy(() => import('./ReviewScreen'))
const MonthScreen = lazy(() => import('./MonthScreen'))

export const routes: RouteDef[] = [
  { path: '/review/month/:month', nav: 'review', component: MonthScreen },
  { path: '/review', nav: 'review', component: ReviewScreen },
  { path: '/review/:weekStart', nav: 'review', component: ReviewScreen },
]
