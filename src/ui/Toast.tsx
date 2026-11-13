import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './icons'

export interface ToastOptions {
  tone?: 'neutral' | 'ok' | 'risk'
  action?: { label: string; onClick: () => void }
  /** Milliseconds before it goes away. Defaults to 4s, or 7s when there is an action. */
  duration?: number
}

interface ToastState extends ToastOptions {
  id: number
  message: string
}

const ToastContext = createContext<{ show: (message: string, options?: ToastOptions) => void }>({ show: () => {} })

/**
 * One quiet line at the bottom of the screen: a confirmation with an Undo, or an error.
 * It never celebrates anything, and a new message simply replaces the previous one.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<number | null>(null)
  const counter = useRef(0)

  const dismiss = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    setToast(null)
  }, [])

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      counter.current += 1
      setToast({ id: counter.current, message, ...options })
      timer.current = window.setTimeout(dismiss, options.duration ?? (options.action ? 7000 : 4000))
    },
    [dismiss],
  )

  useEffect(() => dismiss, [dismiss])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-[60] flex justify-center px-4 lg:inset-x-auto lg:right-6 lg:bottom-6"
      >
        {toast && (
          <div
            key={toast.id}
            role={toast.tone === 'risk' ? 'alert' : 'status'}
            className="animate-rise-in pointer-events-auto flex max-w-[520px] items-center gap-3 rounded-control bg-surface-3 py-2 pr-2 pl-3.5 text-[13.5px] text-ink shadow-pop"
          >
            {toast.tone === 'risk' && <Icon name="alert" size={16} className="shrink-0 text-risk" />}
            {toast.tone === 'ok' && <Icon name="check" size={16} className="shrink-0 text-ok" />}
            <span className="min-w-0 flex-1 py-1.5 leading-snug">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick()
                  dismiss()
                }}
                className="h-11 shrink-0 cursor-pointer rounded-[7px] px-3 text-[13.5px] font-semibold text-cream underline underline-offset-2 hover:bg-surface-2"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismiss}
              className={cx('flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-[7px] text-ink-3 hover:bg-surface-2', toast.action && 'hidden')}
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): { show: (message: string, options?: ToastOptions) => void } {
  return useContext(ToastContext)
}
