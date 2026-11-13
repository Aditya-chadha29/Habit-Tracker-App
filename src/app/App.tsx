import { CoreProvider } from '../state/core'
import { ToastProvider } from '../ui/Toast'
import { ROUTES } from './routes'
import { Shell } from './Shell'
import { Opening, Splash } from './Splash'
import { WhatsNew } from './ChangesSheet'

export default function App() {
  return (
    <>
      <CoreProvider splash={<Splash />}>
        <ToastProvider>
          <Shell routes={ROUTES} />
          <WhatsNew />
        </ToastProvider>
      </CoreProvider>
      <Opening />
    </>
  )
}
