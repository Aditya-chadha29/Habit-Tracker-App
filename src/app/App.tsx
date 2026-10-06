import { CoreProvider } from '../state/core'
import { ToastProvider } from '../ui/Toast'
import { ROUTES } from './routes'
import { Shell } from './Shell'

export default function App() {
  return (
    <CoreProvider>
      <ToastProvider>
        <Shell routes={ROUTES} />
      </ToastProvider>
    </CoreProvider>
  )
}
