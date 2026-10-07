import { lazy } from 'react'
import type { RouteDef } from '../../app/router'

export const routes: RouteDef[] = [{ path: '/settings', nav: 'settings', component: lazy(() => import('./SettingsScreen')) }]
