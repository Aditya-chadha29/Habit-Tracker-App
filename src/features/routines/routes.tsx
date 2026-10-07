import { lazy } from 'react'
import type { RouteDef } from '../../app/router'

export const routes: RouteDef[] = [
  { path: '/routines', nav: 'routines', component: lazy(() => import('./RoutinesScreen')) },
  { path: '/routines/:id', nav: 'routines', component: lazy(() => import('./RoutineEditorScreen')) },
]
