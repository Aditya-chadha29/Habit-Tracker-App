import { lazy } from 'react'
import type { RouteDef } from '../../app/router'

export const routes: RouteDef[] = [{ path: '/search', nav: 'search', component: lazy(() => import('./SearchScreen')) }]
