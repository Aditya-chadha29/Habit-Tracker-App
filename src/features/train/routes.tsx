import { lazy } from 'react'
import type { RouteDef } from '../../app/router'

export const routes: RouteDef[] = [
  { path: '/train', nav: 'train', component: lazy(() => import('./TrainScreen')) },
  { path: '/train/session/:id', nav: 'train', component: lazy(() => import('./SessionScreen')) },
  { path: '/train/history', nav: 'train', component: lazy(() => import('./HistoryScreen')) },
  { path: '/train/exercise/:id', nav: 'train', component: lazy(() => import('./ExerciseScreen')) },
  { path: '/train/setup', nav: 'train', component: lazy(() => import('./SetupScreen')) },
  { path: '/train/setup/routine/:id', nav: 'train', component: lazy(() => import('./RoutineEditorScreen')) },
]
