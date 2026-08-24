import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { seedIfEmpty } from './lib/seed.ts'
import { ThemeProvider } from './lib/theme.tsx'

// autoUpdate mode (skipWaiting + clientsClaim, set in vite.config.ts) only auto-reloads once the
// browser actually runs an update check, which normally requires a fresh navigation. An installed
// PWA resumed from the home screen after being backgrounded is usually NOT a fresh navigation —
// the old JS just keeps running indefinitely against a newer deploy. Forcing an update check on
// every foreground-resume closes that gap.
let swRegistration: ServiceWorkerRegistration | undefined
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    swRegistration = registration
  },
})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') swRegistration?.update()
})

await seedIfEmpty()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
