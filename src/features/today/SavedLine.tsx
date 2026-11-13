import { useEffect } from 'react'
import { Link } from '../../app/router'
import { startSync, useSyncStatus, type SyncStatus } from '../../sync/engine'

function words(status: SyncStatus): string {
  switch (status.phase) {
    case 'synced':
      return 'Saved'
    case 'starting':
    case 'syncing':
      return 'Saving'
    case 'waiting':
      return status.message ? 'Not saved: no connection' : 'Saving'
    case 'choose':
      return 'Cloud copy: a choice is needed'
    case 'signed-out':
      return 'Sign in to save'
    default:
      return 'Not saved: open Data'
  }
}

/** Whether the record is saved to the cloud, in words, on a device that has signed in before. */
export function SavedLine() {
  const status = useSyncStatus()
  useEffect(() => {
    startSync()
  }, [])
  return (
    <Link to="/data" className="inline-flex min-h-11 items-center self-start rounded-control px-1 text-[12.5px] text-night-ink/85 [text-shadow:0_1px_8px_var(--color-night)]" aria-live="polite">
      {words(status)}
    </Link>
  )
}
