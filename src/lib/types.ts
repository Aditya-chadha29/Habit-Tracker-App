export type Polarity = 'do' | 'abstain'

export interface Habit {
  id?: number
  name: string
  short_name: string
  polarity: Polarity
  created_on: string
  retired_on: string | null
  sort_order: number
}

export interface Entry {
  id?: number
  habit_id: number
  date: string
  done: boolean
}

export interface WeeklyRecord {
  id?: number
  week_monday: string
  weight_kg: number | null
  notes: string
}
