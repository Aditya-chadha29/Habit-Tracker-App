import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../../ui/Button'
import { Field, TextInput } from '../../ui/Field'
import { Modal } from '../../ui/Overlay'

interface TypedConfirmProps {
  open: boolean
  title: string
  body: ReactNode
  /** The word that has to be typed before the button works. */
  word: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}

/**
 * A confirmation for the few actions that replace everything on the device. Typing a word is
 * deliberate friction: a second tap in the same place is too easy to make by accident.
 */
export function TypedConfirm({ open, title, body, word, confirmLabel, onCancel, onConfirm }: TypedConfirmProps) {
  const [typed, setTyped] = useState('')
  const matches = typed.trim().toUpperCase() === word
  const close = () => {
    setTyped('')
    onCancel()
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!matches}
            onClick={() => {
              setTyped('')
              onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="text-[14px] leading-relaxed text-ink-2">{body}</div>
        <Field label={`Type ${word} to confirm`}>
          <TextInput value={typed} onChange={(event) => setTyped(event.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} />
        </Field>
      </div>
    </Modal>
  )
}
