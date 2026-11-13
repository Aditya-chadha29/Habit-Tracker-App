import { useState } from 'react'
import { Reorderable, moved } from '../../components/SortableList'
import { platesPerSide } from '../../engine/training'
import { Field, Stepper } from '../../ui/Field'
import { Modal } from '../../ui/Overlay'

/** One line about an exercise in this session: a cue, a pain, a machine setting. */
export function BlockNote({ id, note, editable, onSave }: { id: string; note: string; editable: boolean; onSave: (note: string) => void }) {
  if (!editable) return note ? <p className="px-1.5 text-[13px] leading-snug text-ink-2">Note: {note}</p> : null
  return (
    <input
      // Keyed on the block, never on the stored note: a save must not remount the field mid-typing.
      key={id}
      type="text"
      defaultValue={note}
      maxLength={120}
      enterKeyHint="done"
      placeholder="Note for this exercise"
      aria-label="Note for this exercise"
      onBlur={(event) => {
        if (event.target.value.trim() !== note) onSave(event.target.value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      className="mx-1.5 h-11 rounded-control bg-surface-2 px-3 text-ink shadow-[inset_0_0_0_1px_var(--color-line)] focus:shadow-[inset_0_0_0_1.5px_var(--color-accent-ink)]"
    />
  )
}

/** The plates for each side of the bar. Shown only; nothing is saved. */
export function PlateSheet({ name, barKg, startKg, onClose }: { name: string; barKg: number; startKg: number; onClose: () => void }) {
  const [total, setTotal] = useState(Math.max(barKg, startKg))
  const { plates, left } = platesPerSide(total, barKg)
  const counts = new Map<number, number>()
  for (const plate of plates) counts.set(plate, (counts.get(plate) ?? 0) + 1)
  return (
    <Modal open onClose={onClose} title={`Plates · ${name}`} size="sm">
      <div className="flex flex-col gap-5">
        <Field label="Total weight (kg)" hint={`The bar is ${barKg} kg.`}>
          <Stepper label="Total weight in kilograms" value={total} onChange={setTotal} step={2.5} min={barKg} max={500} unit="kg" size="lg" />
        </Field>
        <div>
          <p className="eyebrow">Each side</p>
          {plates.length === 0 ? (
            <p className="mt-2 text-[14.5px] text-ink">The bar alone.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {[...counts].map(([plate, count]) => (
                <li key={plate} className="tnum rounded-control bg-surface-2 px-3 py-2 text-[15px] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]">
                  {count} × {plate} kg
                </li>
              ))}
            </ul>
          )}
          {left > 0 && <p className="mt-2 text-[13px] text-ink-3">{left} kg cannot be made up with standard plates.</p>}
        </div>
      </div>
    </Modal>
  )
}

/** Drag the exercises of a session into a new order. */
export function ReorderSheet({ blocks, onMove, onClose }: { blocks: { position: number; name: string }[]; onMove: (order: number[]) => void; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Order of exercises" size="sm">
      <Reorderable
        items={blocks}
        nameOf={(block) => block.name}
        onMove={(from, to) => onMove(moved(blocks.map((block) => block.position), from, to))}
        className="divide-y divide-line overflow-hidden rounded-control bg-surface-2"
        itemClassName="flex min-h-[52px] items-center bg-surface-2"
      >
        {(block, _index, handle) => (
          <>
            <span className="flex items-center">{handle}</span>
            <span className="min-w-0 flex-1 truncate pr-3 text-[14.5px] text-ink">{block.name}</span>
          </>
        )}
      </Reorderable>
    </Modal>
  )
}
