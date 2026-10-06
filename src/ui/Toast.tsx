import type { ReactNode } from 'react'

/** STUB — replaced by the UI kit. Signature is the contract. */
export interface ToastOptions {
  tone?: 'neutral' | 'ok' | 'risk'
  action?: { label: string; onClick: () => void }
  duration?: number
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

export function useToast(): { show: (message: string, options?: ToastOptions) => void } {
  return { show: () => {} }
}
