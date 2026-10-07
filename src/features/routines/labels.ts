import type { RoutineSlot } from '../../data/types'

export const SLOT_OPTIONS: { id: RoutineSlot; label: string }[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'pre_gym', label: 'Before the gym' },
  { id: 'evening', label: 'Evening' },
  { id: 'custom', label: 'Any time' },
]

export function slotLabel(slot: RoutineSlot): string {
  return SLOT_OPTIONS.find((option) => option.id === slot)?.label ?? 'Any time'
}
