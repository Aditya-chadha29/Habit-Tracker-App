import type { AreaConfig } from '../../data/types'
import type { IconName } from '../../ui/icons'

/** Icon and one-line description for each pillar. Unknown pillars (one the user adds later)
 *  fall back to a neutral icon and no tagline. */
const META: Record<string, { icon: IconName; tagline: string }> = {
  mind: { icon: 'brain', tagline: 'Mental clarity, focus and inner growth' },
  body: { icon: 'heart', tagline: 'Move well. Eat well. Take care.' },
  learning: { icon: 'graduation', tagline: 'One thing at a time, in order.' },
  exercise: { icon: 'dumbbell', tagline: 'Train consistently. Get stronger.' },
}

export function areaIcon(area: Pick<AreaConfig, 'id'>): IconName {
  return META[area.id]?.icon ?? 'target'
}

export function areaTagline(area: Pick<AreaConfig, 'id'>): string {
  return META[area.id]?.tagline ?? ''
}
