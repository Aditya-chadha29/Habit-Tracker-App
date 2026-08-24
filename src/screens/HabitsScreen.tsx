import { useState } from 'react'
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { addHabit, renameHabit, reorderHabits, restoreHabit, retireHabit } from '../lib/mutations'
import { exportAllData } from '../lib/exportData'
import { useHabits } from '../lib/hooks'
import type { Habit } from '../lib/types'
import { ThemeToggle } from '../components/ThemeToggle'

const inputClass =
  'min-h-[42px] w-full rounded-[4px] border border-ink/20 bg-transparent px-2.5 py-1.5 font-body text-[16px] text-ink'

function HabitRow({ habit, onEdit }: { habit: Habit; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: habit.id!,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const meta = `${habit.retired_on ? 'Retired' : habit.polarity === 'abstain' ? 'Abstain' : 'Do'} · ${habit.short_name}`

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex min-h-[52px] items-center gap-2.5 border-b border-ink/9 px-4 py-1.5"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex-none cursor-grab touch-none border-0 bg-transparent p-0 text-ink/28"
      >
        <GripVertical size={16} />
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left transition-colors duration-100 active:bg-gold/12"
      >
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[14px] leading-[1.25] text-ink">
          {habit.name}
        </div>
        <div className="mt-0.5 text-[10.5px] text-ink/42">{meta}</div>
      </button>
      <button
        type="button"
        onClick={() => (habit.retired_on ? restoreHabit(habit.id!) : retireHabit(habit.id!))}
        className={`min-h-[36px] flex-none cursor-pointer rounded-[4px] border px-2.5 py-1 font-heading text-[12px] transition-[color,background-color,transform] duration-100 active:scale-[0.97] active:bg-gold/12 ${
          habit.retired_on ? 'border-gold text-gold' : 'border-ink/20 text-ink/60'
        }`}
      >
        {habit.retired_on ? 'Restore' : 'Retire'}
      </button>
    </div>
  )
}

export function HabitsScreen() {
  const habits = useHabits()
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editShort, setEditShort] = useState('')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const activeCount = habits.filter((h) => !h.retired_on).length
  const retiredCount = habits.length - activeCount

  function startEdit(h: Habit) {
    setEditingId(h.id!)
    setEditName(h.name)
    setEditShort(h.short_name)
  }

  function saveEdit() {
    if (editingId != null) renameHabit(editingId, editName, editShort)
    setEditingId(null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = habits.findIndex((h) => h.id === active.id)
    const newIndex = habits.findIndex((h) => h.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(habits, oldIndex, newIndex)
    reorderHabits(reordered.map((h) => h.id!))
  }

  async function saveAdd() {
    if (!addName.trim()) return
    await addHabit(addName, habits.length)
    setAddOpen(false)
    setAddName('')
  }

  return (
    <>
      <header className="flex items-end justify-between border-b border-ink/14 px-4 pt-2.5 pb-2.5">
        <div>
          <div className="font-heading text-[22px]">Habits</div>
          <div className="mt-0.5 text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">
            {activeCount} active · {retiredCount} retired
          </div>
        </div>
        <div className="flex flex-none items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => {
              setAddOpen((o) => !o)
              setAddName('')
            }}
            className="min-h-[36px] cursor-pointer rounded-[4px] border border-gold bg-transparent px-3 py-1.5 font-heading text-[13px] text-gold transition-transform duration-100 active:scale-[0.97] active:bg-gold/12"
          >
            {addOpen ? 'Close' : '+ New'}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {addOpen && (
          <div className="border-b border-ink/14 bg-ink/3 px-4 py-3">
            <input
              autoFocus
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Habit name"
              className={inputClass}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={saveAdd}
                className="min-h-[42px] flex-1 cursor-pointer rounded-[4px] border border-gold bg-transparent font-heading text-[14px] text-gold transition-transform duration-100 active:scale-[0.97] active:bg-gold/12"
              >
                Add habit
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddOpen(false)
                  setAddName('')
                }}
                className="min-h-[42px] cursor-pointer rounded-[4px] border border-ink/20 bg-transparent px-3.5 font-heading text-[14px] text-ink/60 transition-transform duration-100 active:scale-[0.97] active:bg-gold/12"
              >
                Cancel
              </button>
            </div>
            <div className="mt-2 text-[10.5px] leading-[1.5] text-ink/40">
              Starts counting from today. Earlier days are never counted as misses.
            </div>
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={habits.map((h) => h.id!)} strategy={verticalListSortingStrategy}>
            {habits.map((h) =>
              editingId === h.id ? (
                <div key={h.id} className="border-b border-ink/9 bg-ink/3 px-4 py-3">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Habit name"
                    className={inputClass}
                  />
                  <input
                    value={editShort}
                    onChange={(e) => setEditShort(e.target.value)}
                    placeholder="Short name"
                    className={`mt-2 ${inputClass}`}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="min-h-[42px] flex-1 cursor-pointer rounded-[4px] border border-gold bg-transparent font-heading text-[14px] text-gold transition-transform duration-100 active:scale-[0.97] active:bg-gold/12"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="min-h-[42px] cursor-pointer rounded-[4px] border border-ink/20 bg-transparent px-3.5 font-heading text-[14px] text-ink/60 transition-transform duration-100 active:scale-[0.97] active:bg-gold/12"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <HabitRow key={h.id} habit={h} onEdit={() => startEdit(h)} />
              ),
            )}
          </SortableContext>
        </DndContext>

        <div className="px-4 pt-3.5 text-[11px] leading-[1.55] text-ink/40">
          Habits are never deleted. Retiring stops a habit appearing from today forward and removes it from the
          daily denominator; every past entry stays as recorded.
        </div>
        <div className="px-4 pt-3 pb-5">
          <button
            type="button"
            onClick={() => exportAllData()}
            className="cursor-pointer border-0 bg-transparent p-0 font-heading text-[12px] text-ink/50 underline decoration-ink/25 underline-offset-2 transition-opacity duration-100 active:opacity-60"
          >
            Export data
          </button>
        </div>
      </div>
    </>
  )
}
