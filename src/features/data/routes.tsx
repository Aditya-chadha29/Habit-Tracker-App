import { lazy } from 'react'
import type { RouteDef } from '../../app/router'

export const routes: RouteDef[] = [{ path: '/data', nav: 'settings', component: lazy(() => import('./DataScreen')) }]
