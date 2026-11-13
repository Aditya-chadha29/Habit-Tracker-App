import { useState } from 'react'
import { useCore } from '../state/core'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Overlay'
import { markChangesSeen, unseenChanges, type ChangeNote } from './whatsNew'

/** One sheet after an update, listing what changed. Closing it is the end of it. */
export function WhatsNew() {
  const { index } = useCore()
  const [notes, setNotes] = useState<ChangeNote[]>(() => unseenChanges(index.manual.size > 0))
  if (notes.length === 0) return null
  const close = () => {
    markChangesSeen()
    setNotes([])
  }
  return (
    <Modal
      open
      onClose={close}
      title="What changed"
      size="md"
      footer={
        <Button variant="primary" block onClick={close}>
          Close
        </Button>
      }
    >
      <ul className="flex flex-col gap-2.5">
        {notes.flatMap((note) => note.lines).map((line) => (
          <li key={line} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-2">
            <span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-3" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
