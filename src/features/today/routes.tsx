import { lazy } from 'react'
import type { RouteDef } from '../../app/router'
import HomeScreen from './HomeScreen'

// Home is the first thing on screen, so it ships in the main bundle; the rest load on demand.
export const routes: RouteDef[] = [
  { path: '/', nav: 'today', component: HomeScreen },
  { path: '/today', nav: 'today', component: lazy(() => import('./TodayScreen')) },
  { path: '/area/:id', nav: 'today', component: lazy(() => import('./AreaScreen')) },
  { path: '/nutrition', nav: 'today', component: lazy(() => import('./NutritionScreen')) },
]
