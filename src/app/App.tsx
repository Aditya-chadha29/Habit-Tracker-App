import { CoreProvider } from '../state/core'
import { ToastProvider } from '../ui/Toast'
import { ROUTES } from './routes'
import { Shell } from './Shell'

export default function App() {
  return (
    <CoreProvider splash={<p className="p-8 pt-16 text-[14px] text-ink-3">Loading your data…</p>}>
      <ToastProvider>
        <Shell routes={ROUTES} />
      </ToastProvider>
    </CoreProvider>
  )
}
