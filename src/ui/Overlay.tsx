import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button, IconButton } from './Button'
import { cx } from './cx'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * What every dialog needs: focus moves in and cannot leave, Escape closes it, the page behind
 * does not scroll, and focus goes back to whatever opened it.
 */
function useDialogBehaviour(open: boolean, onClose: () => void) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close.current()
        return
      }
      if (event.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!items.length) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === panel.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = overflow
      opener?.focus()
    }
  }, [open])

  return panel
}

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  /** Where the panel sits once there is room for it not to be a bottom sheet. */
  wide: 'dialog' | 'side'
  maxWidth?: string
}

function Sheet({ open, onClose, title, children, footer, wide, maxWidth }: SheetProps) {
  const panel = useDialogBehaviour(open, onClose)
  const titleId = useId()
  if (!open) return null
  return createPortal(
    <div className={cx('fixed inset-0 z-50 flex items-end justify-center', wide === 'dialog' ? 'sm:items-center sm:p-6' : 'lg:items-stretch lg:justify-end')}>
      <div aria-hidden="true" className="animate-fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'animate-sheet-up relative flex max-h-[92dvh] w-full flex-col rounded-t-[20px] bg-surface shadow-pop outline-none',
          wide === 'dialog' ? cx('sm:animate-rise-in sm:rounded-card', maxWidth) : 'lg:animate-fade-in lg:h-full lg:max-h-none lg:w-[460px] lg:rounded-none',
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-line py-2 pr-2 pl-4">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-[16px] font-semibold text-ink">
            {title}
          </h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">{footer}</div>
        ) : (
          <div className="pb-safe" />
        )}
      </div>
    </div>,
    document.body,
  )
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const MODAL_WIDTH = { sm: 'sm:max-w-[420px]', md: 'sm:max-w-[560px]', lg: 'sm:max-w-[760px]' }

/** A dialog: a bottom sheet on a phone, a centred panel from 640px. */
export function Modal({ size = 'md', ...rest }: ModalProps) {
  return <Sheet wide="dialog" maxWidth={MODAL_WIDTH[size]} {...rest} />
}

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}

/** A panel for editing something while its list stays visible: a bottom sheet on a phone, a
 *  right-hand panel from 1024px. */
export function Drawer(props: DrawerProps) {
  return <Sheet wide="side" {...props} />
}

interface ConfirmationDialogProps {
  open: boolean
  title: string
  body?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

/** Asks before something that cannot simply be undone. The browser's confirm() is never used. */
export function ConfirmationDialog({ open, title, body, confirmLabel, cancelLabel = 'Cancel', tone = 'default', onConfirm, onCancel }: ConfirmationDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body && <div className="text-[14px] leading-relaxed text-ink-2">{body}</div>}
    </Modal>
  )
}
