import type { Equipment, ExerciseKind, MuscleGroup } from '../../data/types'

export const MUSCLES: MuscleGroup[] = [
  'chest', 'back', 'traps', 'shoulders', 'biceps', 'triceps', 'forearms',
  'quads', 'hamstrings', 'glutes', 'calves', 'core', 'cardio',
]

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  traps: 'Traps',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
  cardio: 'Cardio',
}

export const EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'smith', 'bodyweight', 'kettlebell', 'band', 'other']

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  smith: 'Smith machine',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
  band: 'Band',
  other: 'Other',
}

export const KIND_LABEL: Record<ExerciseKind, string> = {
  weight_reps: 'Weight and reps',
  bodyweight_reps: 'Reps only',
  weighted_bodyweight: 'Added weight and reps',
  time: 'Time held',
  distance_time: 'Time and distance',
}

export const KINDS: ExerciseKind[] = ['weight_reps', 'bodyweight_reps', 'weighted_bodyweight', 'time', 'distance_time']
