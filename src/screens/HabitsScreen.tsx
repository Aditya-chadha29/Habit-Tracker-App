import { useEffect, useRef, useState } from 'react'
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, GripVertical } from 'lucide-react'
import { addHabit, deleteHabit, renameHabit, reorderHabits, restoreHabit, retireHabit } from '../lib/mutations'
import { exportAllData } from '../lib/exportData'
import { todayLocalStr } from '../lib/dates'
import type { Habit } from '../lib/types'
import { ThemeToggle } from '../components/ThemeToggle'

const inputClass =
  'min-h-[42px] w-full rounded-[4px] border border-ink/20 bg-transparent px-2.5 py-1.5 font-body text-[16px] text-ink'
const buttonPress = 'transition-transform duration-100 active:scale-[0.97] active:bg-accent/12'
const DELETE_ARM_MS = 3000

function habitMeta(habit: Habit): string {
  return `${habit.retired_on ? 'Retired' : habit.polarity === 'abstain' ? 'Abstain' : 'Do'} · ${habit.short_name}`
}

function SortableHabitRow({ habit, onEdit }: { habit: Habit; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: habit.id!,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

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
        className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left transition-colors duration-100 active:bg-accent/12"
      >
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[14px] leading-[1.25] text-ink">
          {habit.name}
        </div>
        <div className="mt-0.5 text-[10.5px] text-ink/42">{habitMeta(habit)}</div>
      </button>
      <button
        type="button"
        onClick={() => retireHabit(habit.id!)}
        className={`min-h-[36px] flex-none cursor-pointer rounded-[4px] border border-ink/20 px-2.5 py-1 font-heading text-[12px] text-ink/60 transition-colors duration-100 ${buttonPress}`}
      >
        Retire
      </button>
    </div>
  )
}

function StaticHabitRow({ habit, onEdit }: { habit: Habit; onEdit: () => void }) {
  return (
    <div className="flex min-h-[52px] items-center gap-2.5 border-b border-ink/9 px-4 py-1.5 pl-[34px]">
      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left transition-colors duration-100 active:bg-accent/12"
      >
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[14px] leading-[1.25] text-ink">
          {habit.name}
        </div>
        <div className="mt-0.5 text-[10.5px] text-ink/42">{habitMeta(habit)}</div>
      </button>
      <button
        type="button"
        onClick={() => restoreHabit(habit.id!)}
        className={`min-h-[36px] flex-none cursor-pointer rounded-[4px] border border-accent px-2.5 py-1 font-heading text-[12px] text-accent transition-colors duration-100 ${buttonPress}`}
      >
        Restore
      </button>
    </div>
  )
}

function EditPanel({
  name,
  short,
  onNameChange,
  onShortChange,
  onSave,
  onCancel,
  canDelete,
  deleteArmed,
  onDeleteTap,
}: {
  name: string
  short: string
  onNameChange: (v: string) => void
  onShortChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  canDelete: boolean
  deleteArmed: boolean
  onDeleteTap: () => void
}) {
  return (
    <div className="border-b border-ink/9 bg-ink/3 px-4 py-3">
      <input autoFocus value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="Habit name" className={inputClass} />
      <input value={short} onChange={(e) => onShortChange(e.target.value)} placeholder="Short name" className={`mt-2 ${inputClass}`} />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onSave}
          className={`min-h-[42px] flex-1 cursor-pointer rounded-[4px] border border-accent bg-transparent font-heading text-[14px] text-accent ${buttonPress}`}
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`min-h-[42px] cursor-pointer rounded-[4px] border border-ink/20 bg-transparent px-3.5 font-heading text-[14px] text-ink/60 ${buttonPress}`}
        >
          Cancel
        </button>
      </div>
      {canDelete && (
        <div className="mt-3 border-t border-ink/9 pt-3">
          <button
            type="button"
            onClick={onDeleteTap}
            className="cursor-pointer border-0 bg-transparent p-0 font-heading text-[12px] transition-colors duration-100"
            style={{ color: 'var(--color-danger)' }}
          >
            {deleteArmed ? 'Tap again to delete permanently' : 'Delete — added today, no history to lose'}
          </button>
        </div>
      )}
    </div>
  )
}

export function HabitsScreen({ habits }: { habits: Habit[] }) {
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editShort, setEditShort] = useState('')
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [retiredOpen, setRetiredOpen] = useState(false)
  const deleteArmTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addNameInputRef = useRef<HTMLInputElement>(null)

  // The add-form no longer unmounts when closed (it animates open/shut instead), so autoFocus
  // only firing on first mount isn't enough to refocus it each time it reopens.
  useEffect(() => {
    if (addOpen) addNameInputRef.current?.focus()
  }, [addOpen])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const today = todayLocalStr()
  const activeHabits = habits.filter((h) => !h.retired_on)
  const retiredHabits = habits
    .filter((h) => h.retired_on)
    .sort((a, b) => (b.retired_on! < a.retired_on! ? -1 : b.retired_on! > a.retired_on! ? 1 : 0))

  function clearDeleteArm() {
    if (deleteArmTimeout.current) clearTimeout(deleteArmTimeout.current)
    setDeleteArmed(false)
  }

  function startEdit(h: Habit) {
    setEditingId(h.id!)
    setEditName(h.name)
    setEditShort(h.short_name)
    clearDeleteArm()
  }

  function closeEdit() {
    setEditingId(null)
    clearDeleteArm()
  }

  function saveEdit() {
    if (editingId != null) renameHabit(editingId, editName, editShort)
    closeEdit()
  }

  function handleDeleteTap(id: number) {
    if (deleteArmed) {
      clearDeleteArm()
      setEditingId(null)
      deleteHabit(id)
    } else {
      setDeleteArmed(true)
      deleteArmTimeout.current = setTimeout(() => setDeleteArmed(false), DELETE_ARM_MS)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = activeHabits.findIndex((h) => h.id === active.id)
    const newIndex = activeHabits.findIndex((h) => h.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(activeHabits, oldIndex, newIndex)
    reorderHabits(reordered.map((h) => h.id!))
  }

  async function saveAdd() {
    if (!addName.trim()) return
    await addHabit(addName, activeHabits.length)
    setAddOpen(false)
    setAddName('')
  }

  function renderEditPanel(h: Habit) {
    return (
      <EditPanel
        key={h.id}
        name={editName}
        short={editShort}
        onNameChange={setEditName}
        onShortChange={setEditShort}
        onSave={saveEdit}
        onCancel={closeEdit}
        canDelete={h.created_on === today}
        deleteArmed={deleteArmed}
        onDeleteTap={() => handleDeleteTap(h.id!)}
      />
    )
  }

  return (
    <>
      <header className="flex items-end justify-between border-b border-ink/14 px-4 pt-2.5 pb-2.5">
        <div>
          <div className="font-heading text-[22px]">Habits</div>
          <div className="mt-0.5 text-[10.5px] tracking-[0.1em] text-ink/45 uppercase">
            {activeHabits.length} active · {retiredHabits.length} retired
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
            className={`min-h-[36px] cursor-pointer rounded-[4px] border border-accent bg-transparent px-3 py-1.5 font-heading text-[13px] text-accent ${buttonPress}`}
          >
            {addOpen ? 'Close' : '+ New'}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${addOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="min-h-0 overflow-hidden">
            <div className="border-b border-ink/14 bg-ink/3 px-4 py-3">
              <input
                ref={addNameInputRef}
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Habit name"
                className={inputClass}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={saveAdd}
                  className={`min-h-[42px] flex-1 cursor-pointer rounded-[4px] border border-accent bg-transparent font-heading text-[14px] text-accent ${buttonPress}`}
                >
                  Add habit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false)
                    setAddName('')
                  }}
                  className={`min-h-[42px] cursor-pointer rounded-[4px] border border-ink/20 bg-transparent px-3.5 font-heading text-[14px] text-ink/60 ${buttonPress}`}
                >
                  Cancel
                </button>
              </div>
              <div className="mt-2 text-[10.5px] leading-[1.5] text-ink/40">
                Starts counting from today. Earlier days are never counted as misses.
              </div>
            </div>
          </div>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={activeHabits.map((h) => h.id!)} strategy={verticalListSortingStrategy}>
            {activeHabits.map((h) =>
              editingId === h.id ? renderEditPanel(h) : <SortableHabitRow key={h.id} habit={h} onEdit={() => startEdit(h)} />,
            )}
          </SortableContext>
        </DndContext>

        {retiredHabits.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setRetiredOpen((o) => !o)}
              className="flex min-h-[42px] w-full cursor-pointer items-center justify-between border-b border-ink/9 bg-transparent px-4 font-heading text-[12px] tracking-[0.06em] text-ink/45 uppercase transition-colors duration-100 active:bg-accent/12"
            >
              <span>Retired · {retiredHabits.length}</span>
              <ChevronDown
                size={15}
                strokeWidth={1.5}
                className={`transition-transform duration-150 ${retiredOpen ? 'rotate-180' : ''}`}
              />
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-200 ease-out ${retiredOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
            >
              <div className="min-h-0 overflow-hidden">
                {retiredHabits.map((h) =>
                  editingId === h.id ? renderEditPanel(h) : <StaticHabitRow key={h.id} habit={h} onEdit={() => startEdit(h)} />,
                )}
              </div>
            </div>
          </>
        )}

        <div className="px-4 pt-3.5 text-[11px] leading-[1.55] text-ink/40">
          Habits are never deleted once they've seen a day pass — retiring stops one appearing
          from today forward and removes it from the daily denominator; every past entry stays as
          recorded. A habit added by mistake today can still be deleted outright, since it hasn't
          become history yet.
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
