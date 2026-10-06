import type { RouteDef } from './router'
import { routes as data } from '../features/data/routes'
import { routes as habits } from '../features/habits/routes'
import { routes as journal } from '../features/journal/routes'
import { routes as kit } from '../features/kit/routes'
import { routes as learn } from '../features/learn/routes'
import { routes as progress } from '../features/progress/routes'
import { routes as quotes } from '../features/quotes/routes'
import { routes as review } from '../features/review/routes'
import { routes as routines } from '../features/routines/routes'
import { routes as settings } from '../features/settings/routes'
import { routes as today } from '../features/today/routes'
import { routes as train } from '../features/train/routes'

/** Every screen in the app. Each feature owns its own list; this only joins them. */
export const ROUTES: RouteDef[] = [
  ...today,
  ...learn,
  ...train,
  ...review,
  ...progress,
  ...journal,
  ...habits,
  ...routines,
  ...quotes,
  ...data,
  ...settings,
  // The component gallery, for checking the kit by eye. Not linked from anywhere.
  ...kit,
]
