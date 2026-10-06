/**
 * The starting training week. 0 = Monday … 6 = Sunday. Exercises are matched by name in the
 * exercise library. Seeded once into an empty routines table; after that the programme is the
 * user's to change and this is never read again.
 */
export const WORKOUT_ROUTINE_SEED: { name: string; weekdays: number[]; exercises: string[] }[] = [
  {
    name: 'Legs + Shoulders',
    weekdays: [6],
    exercises: [
      'Back Squat',
      'Leg Press',
      'Romanian Deadlift',
      'Seated Leg Curl',
      'Standing Calf Raise',
      'Overhead Press',
      'Dumbbell Lateral Raise',
    ],
  },
  { name: 'Cardio', weekdays: [0, 2, 4], exercises: ['Treadmill / Run'] },
  {
    name: 'Chest + Triceps',
    weekdays: [1],
    exercises: [
      'Barbell Bench Press',
      'Incline Dumbbell Press',
      'Pec Deck',
      'Triceps Rope Pushdown',
      'Overhead Cable Extension',
    ],
  },
  {
    name: 'Back + Biceps',
    weekdays: [3],
    exercises: ['Lat Pulldown', 'Barbell Row', 'Seated Cable Row', 'Barbell Curl', 'Hammer Curl'],
  },
  {
    name: 'Shoulders + Arms + Core',
    weekdays: [5],
    exercises: [
      'Machine Shoulder Press',
      'Dumbbell Lateral Raise',
      'Hammer Curl',
      'Triceps Rope Pushdown',
      'Hip Abduction Machine',
      'Cable Crunch',
      'Plank',
      'Treadmill / Run',
    ],
  },
]
