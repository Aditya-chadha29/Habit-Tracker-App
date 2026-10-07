import { lazy } from 'react'
import type { RouteDef } from '../../app/router'

const HabitEditorScreen = lazy(() => import('./HabitEditorScreen'))

export const routes: RouteDef[] = [
  { path: '/habits', nav: 'habits', component: lazy(() => import('./HabitsScreen')) },
  { path: '/habits/:id', nav: 'habits', component: HabitEditorScreen },
]
