import { CoreProvider } from '../state/core'
import { ToastProvider } from '../ui/Toast'
import { ROUTES } from './routes'
import { Shell } from './Shell'
import { Opening, Splash } from './Splash'

export default function App() {
  return (
    <>
      <CoreProvider splash={<Splash />}>
        <ToastProvider>
          <Shell routes={ROUTES} />
        </ToastProvider>
      </CoreProvider>
      <Opening />
    </>
  )
}
