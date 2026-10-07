import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'
import { IconButton } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/icons'

interface RowProps {
  id: number
  name: string
  index: number
  count: number
  onMove: (index: number, by: number) => void
  children: ReactNode
}

function Row({ id, name, index, count, onMove, children }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx('flex items-stretch bg-surface', isDragging && 'relative z-10 shadow-pop')}
    >
      <button
        type="button"
        aria-label={`Drag to reorder ${name}`}
        className="flex w-9 shrink-0 cursor-grab touch-none items-center justify-center text-ink-3 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <Icon name="grip" size={16} />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex shrink-0 items-center pr-1">
        <IconButton icon="chevron-up" size="sm" label={`Move ${name} up`} disabled={index === 0} onClick={() => onMove(index, -1)} />
        <IconButton icon="chevron-down" size="sm" label={`Move ${name} down`} disabled={index === count - 1} onClick={() => onMove(index, 1)} />
      </div>
    </li>
  )
}

interface SortableListProps<T> {
  items: readonly T[]
  idOf: (item: T) => number
  nameOf: (item: T) => string
  /** Called with every id in the new order. */
  onReorder: (orderedIds: number[]) => void
  children: (item: T, index: number) => ReactNode
  className?: string
}

/**
 * A list whose order can be changed two ways: by dragging the handle, or with the up and down
 * buttons — so reordering never depends on being able to drag.
 */
export function SortableList<T>({ items, idOf, nameOf, onReorder, children, className }: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = items.map(idOf)

  const move = (index: number, by: number) => {
    const target = index + by
    if (target < 0 || target >= ids.length) return
    onReorder(arrayMove(ids, index, target))
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = ids.indexOf(Number(active.id))
    const to = ids.indexOf(Number(over.id))
    if (from < 0 || to < 0) return
    onReorder(arrayMove(ids, from, to))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className={cx('divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card', className)}>
          {items.map((item, index) => (
            <Row key={idOf(item)} id={idOf(item)} name={nameOf(item)} index={index} count={items.length} onMove={move}>
              {children(item, index)}
            </Row>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
