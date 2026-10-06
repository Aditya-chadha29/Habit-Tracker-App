import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches a crash in one screen so the rest of the app — and above all the navigation to the
 * Data screen, where everything can be exported — keeps working. React still requires a class
 * for this.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Screen crashed', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-[17px] font-semibold text-ink">This screen could not be shown.</h1>
        <p className="max-w-[46ch] text-[14px] text-ink-2">
          Nothing has been lost: your data is stored on this device and has not been changed. You can export it
          from Data.
        </p>
        <p className="max-w-[60ch] rounded-control bg-surface-2 px-3 py-2 font-mono text-[12px] break-words text-ink-3">
          {error.message}
        </p>
        <div className="flex gap-3">
          <a href="#/data" className="inline-flex h-11 items-center rounded-control bg-surface-2 px-4 text-[14px] font-medium text-ink">
            Open Data
          </a>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-11 cursor-pointer items-center rounded-control bg-accent px-4 text-[14px] font-medium text-on-accent"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
