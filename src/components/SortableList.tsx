import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'
import { cx } from '../ui/cx'
import { Icon } from '../ui/icons'

/** Moves one element of a list from one place to another, returning a new list. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  return arrayMove([...list], from, to)
}

interface ItemProps {
  id: string
  name: string
  className?: string
  children: (handle: ReactNode) => ReactNode
}

function Item({ id, name, className, children }: ItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const handle = (
    <button
      type="button"
      aria-label={`Drag to reorder ${name}. With a keyboard: space to pick up, arrows to move, space to drop.`}
      className="flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center text-ink-3 active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <Icon name="grip" size={16} />
    </button>
  )
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx(className, isDragging && 'relative z-10 opacity-90 shadow-pop')}>
      {children(handle)}
    </li>
  )
}

interface ReorderableProps<T> {
  items: readonly T[]
  nameOf: (item: T, index: number) => string
  /** Called when an item has been dropped somewhere else. */
  onMove: (from: number, to: number) => void
  /** Each row is given the drag handle (the dots) to place where it wants. */
  children: (item: T, index: number, handle: ReactNode) => ReactNode
  /** Classes for the list. */
  className?: string
  /** Classes for each row. */
  itemClassName?: string
  /** A grid of cards rather than a column of rows. */
  grid?: boolean
}

/**
 * Anything whose order the user sets. The order is changed by dragging the dots, with a finger, a
 * mouse or the keyboard; there are no separate up and down buttons, at the user's request.
 */
export function Reorderable<T>({ items, nameOf, onMove, children, className, itemClassName, grid = false }: ReorderableProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  // Positions are the identities: the list is re-read after every drop.
  const ids = items.map((_, index) => String(index))

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from >= 0 && to >= 0) onMove(from, to)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={grid ? rectSortingStrategy : verticalListSortingStrategy}>
        <ul className={className}>
          {items.map((item, index) => (
            <Item key={ids[index]} id={ids[index]} name={nameOf(item, index)} className={itemClassName}>
              {(handle) => children(item, index, handle)}
            </Item>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
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

/** A card of rows that are stored records, reordered by their ids. */
export function SortableList<T>({ items, idOf, nameOf, onReorder, children, className }: SortableListProps<T>) {
  return (
    <Reorderable
      items={items}
      nameOf={nameOf}
      onMove={(from, to) => onReorder(moved(items.map(idOf), from, to))}
      className={cx('divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card', className)}
      itemClassName="flex items-stretch bg-surface"
    >
      {(item, index, handle) => (
        <>
          <span className="flex items-center">{handle}</span>
          <div className="min-w-0 flex-1">{children(item, index)}</div>
        </>
      )}
    </Reorderable>
  )
}
