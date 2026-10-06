import { useState } from 'react'
import { X } from 'lucide-react'
import type { Exercise } from '../../lib/types'

const buttonPress = 'transition-transform duration-100 active:scale-[0.97] active:bg-accent/12'

/**
 * Full-screen exercise list. Recently used exercises float to the top, because the next exercise
 * is nearly always one from the last few sessions — typing a name is the slow path, not the
 * default one.
 */
export function ExercisePicker({
  exercises,
  recentIds,
  title,
  onPick,
  onClose,
}: {
  exercises: Exercise[]
  recentIds: number[]
  title: string
  onPick: (exercise: Exercise) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const available = exercises.filter((e) => !e.retired_on)
  const matches = q ? available.filter((e) => e.name.toLowerCase().includes(q)) : available

  const rank = (e: Exercise) => {
    const i = recentIds.indexOf(e.id!)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  const ordered = q ? matches : [...matches].sort((a, b) => rank(a) - rank(b))

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-grain">
      <div className="flex flex-none items-center gap-2 border-b border-ink/14 px-3 py-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={title}
          className="min-w-0 flex-1 rounded-[4px] border border-ink/20 bg-transparent px-3 py-2 text-[14px] text-ink placeholder:text-ink/35 focus:outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={`flex h-10 w-10 flex-none cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent text-ink/60 ${buttonPress}`}
        >
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {ordered.length === 0 && (
          <div className="px-4 py-6 text-[12px] text-ink/35">
            Nothing matches. Add it from Gym › Exercises.
          </div>
        )}
        {ordered.map((exercise) => (
          <button
            key={exercise.id}
            type="button"
            onClick={() => onPick(exercise)}
            className={`flex min-h-[48px] w-full cursor-pointer items-center gap-3 border-b border-ink/9 bg-transparent px-4 text-left ${buttonPress}`}
          >
            <span className="min-w-0 flex-1 truncate text-[14px] text-ink/80">{exercise.name}</span>
            <span className="flex-none text-[10.5px] tracking-[0.06em] text-ink/35 uppercase">
              {exercise.primary_muscle}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
