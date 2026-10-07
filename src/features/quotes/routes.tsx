import { lazy } from 'react'
import type { RouteDef } from '../../app/router'

export const routes: RouteDef[] = [{ path: '/quotes', nav: 'settings', component: lazy(() => import('./QuotesScreen')) }]
