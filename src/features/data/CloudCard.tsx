import { useEffect, useState, type FormEvent } from 'react'
import {
  createAccount,
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signOutOfCloud,
  startSync,
  syncNow,
  useSyncStatus,
  type SyncStatus,
} from '../../sync/engine'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Field, TextInput } from '../../ui/Field'

const WHEN = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const when = (ms: number | null): string => (ms ? WHEN.format(new Date(ms)) : 'not yet')

function statusLine(status: SyncStatus): string {
  switch (status.phase) {
    case 'starting':
      return 'Checking…'
    case 'syncing':
      return 'Saving…'
    case 'synced':
      return `Saved to the cloud. Last saved ${when(status.syncedAt)}.`
    case 'waiting':
      return status.message ?? `Changes waiting to be saved. Last saved ${when(status.syncedAt)}.`
    case 'choose':
      return 'This device and the cloud copy are different.'
    case 'blocked':
      return status.message ?? 'The cloud copy could not be read.'
    case 'error':
      return status.message ?? 'The cloud copy could not be reached.'
    default:
      return ''
  }
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const run = async (work: () => Promise<string | null>, done?: string) => {
    setBusy(true)
    setProblem(null)
    setNote(null)
    const failed = await work()
    setBusy(false)
    if (failed) setProblem(failed)
    else if (done) setNote(done)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(() => signInWithEmail(email.trim(), password))
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13.5px] leading-relaxed text-ink-2">
        Keep a copy of the whole record in your own cloud account. Sign in on another device, or on a new home-screen icon, and the same record appears there.
      </p>
      <Button variant="primary" disabled={busy} onClick={() => void run(signInWithGoogle)}>
        Continue with Google
      </Button>
      <form onSubmit={submit} className="flex flex-col gap-3 border-t border-line pt-4">
        <Field label="Email">
          <TextInput type="email" autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Password" hint="At least 6 characters.">
          <TextInput type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Button type="submit" disabled={busy || !email || !password}>
            Sign in
          </Button>
          <Button type="button" disabled={busy || !email || !password} onClick={() => void run(() => createAccount(email.trim(), password))}>
            Create account
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || !email}
          onClick={() => void run(() => sendPasswordReset(email.trim()), 'If there is an account with this email, a reset link has been sent to it.')}
        >
          Send a password reset email
        </Button>
      </form>
      {problem && (
        <p role="alert" className="text-[13.5px] leading-relaxed text-risk">
          Not signed in. {problem}
        </p>
      )}
      {note && <p className="text-[13.5px] leading-relaxed text-ink-2">{note}</p>}
    </div>
  )
}

function Choose({ status }: { status: SyncStatus }) {
  const [busy, setBusy] = useState(false)
  if (!status.choose) return null
  const { cloud, local } = status.choose
  const pick = async (choice: 'device' | 'cloud') => {
    setBusy(true)
    await syncNow(choice)
    setBusy(false)
  }
  return (
    <div className="flex flex-col gap-3 rounded-control bg-surface-2 p-3">
      <p className="text-[13.5px] font-medium text-ink">Choose which record to keep</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13.5px]">
        <dt className="text-ink-2">This device</dt>
        <dd className="tnum text-right text-ink">{local.entries} ticks</dd>
        <dt className="text-ink-2">
          Cloud copy, saved {when(cloud.updated_at)}
          {cloud.device ? ` from ${cloud.device}` : ''}
        </dt>
        <dd className="tnum text-right text-ink">{cloud.entries} ticks</dd>
      </dl>
      <p className="text-[12.5px] leading-relaxed text-ink-3">
        The other one is replaced. If the cloud copy is used, an automatic copy of this device is taken first and stays under Automatic copies.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={busy} onClick={() => void pick('device')}>
          Keep this device
        </Button>
        <Button disabled={busy} onClick={() => void pick('cloud')}>
          Use the cloud copy
        </Button>
      </div>
    </div>
  )
}

export function CloudCard() {
  const status = useSyncStatus()
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    startSync()
  }, [])

  const signedIn = status.email !== null || (status.phase !== 'signed-out' && status.phase !== 'starting' && status.phase !== 'error')
  const tone = status.phase === 'error' || status.phase === 'blocked' ? 'text-risk' : 'text-ink-2'

  return (
    <Card className="flex flex-col gap-3">
      {status.phase === 'starting' && <p className="text-[13.5px] text-ink-2">Checking…</p>}
      {status.phase === 'signed-out' && <SignIn />}
      {status.phase === 'error' && !signedIn && (
        <p role="alert" className="text-[13.5px] leading-relaxed text-risk">
          {status.message}
        </p>
      )}
      {signedIn && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13.5px]">
            <dt className="text-ink-2">Signed in as</dt>
            <dd className="min-w-0 truncate text-right text-ink">{status.email ?? 'your account'}</dd>
          </dl>
          <p role="status" className={`text-[13.5px] leading-relaxed ${tone}`}>
            {statusLine(status)}
          </p>
          <Choose status={status} />
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={status.phase === 'syncing' || status.phase === 'choose'} onClick={() => void syncNow()}>
              Save now
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                void signOutOfCloud().then((failed) => {
                  setProblem(failed)
                })
              }
            >
              Sign out
            </Button>
          </div>
          {problem && (
            <p role="alert" className="text-[13.5px] text-risk">
              {problem}
            </p>
          )}
          <p className="text-[12.5px] leading-relaxed text-ink-3">
            Signing out leaves the record on this device as it is. The app keeps working without a connection and saves when there is one.
          </p>
        </>
      )}
    </Card>
  )
}
