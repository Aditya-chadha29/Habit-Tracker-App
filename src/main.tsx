import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/geist'
import './index.css'
import App from './app/App'
import { SafeMode } from './app/SafeMode'
import { db } from './data/db'
import { runMigrations } from './data/migrations'
import { DATA_FORMAT } from './data/settingsRepo'
import { toLocalDateStr } from './engine/dates'
import { readStoredTheme } from './state/theme'

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

const root = createRoot(document.getElementById('root')!)

/**
 * Start-up, in the order that keeps data safe:
 *   1. open the database (a failure here goes to safe mode, never to a blank page);
 *   2. refuse to run against data written by a NEWER build than this one — a stale cached bundle
 *      must not reinterpret rows it does not understand;
 *   3. run any pending data migration, each one atomic and preceded by a full backup copy;
 *   4. only then render the app.
 */
async function boot(): Promise<void> {
  try {
    await db.open()

    // Ask the browser not to evict this origin's storage under pressure. Everything the user
    // has ever recorded lives here, so it is worth asking; a refusal changes nothing.
    void navigator.storage?.persist?.().catch(() => undefined)

    const storedFormat = (await db.settings.get('data_format'))?.value
    if (typeof storedFormat === 'number' && storedFormat > DATA_FORMAT) {
      root.render(<SafeMode kind="newer-data" error={null} />)
      void swRegistration?.update()
      return
    }

    const now = new Date()
    await runMigrations({ db, today: toLocalDateStr(now), now: now.getTime(), theme: readStoredTheme() })
  } catch (error) {
    console.error('Start-up failed', error)
    root.render(<SafeMode kind="failed" error={error} />)
    return
  }

  if (import.meta.env.DEV) {
    // For the screenshot and end-to-end scripts, which seed rows directly. Never in production.
    ;(window as unknown as { __db: typeof db }).__db = db
  }

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
