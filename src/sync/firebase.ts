import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  initializeAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { Bytes, deleteDoc, doc, getDoc, getFirestore, runTransaction, setDoc } from 'firebase/firestore/lite'
import { FIREBASE_CONFIG } from './config'
import type { Cloud, CloudMeta } from './sync'

/**
 * Everything that touches Firebase. Loaded only when the cloud copy is used, so the app starts
 * the same with or without a connection.
 *
 * Sign-in is remembered in localStorage rather than IndexedDB, and the database client is the
 * "lite" one that works over plain requests: neither opens an IndexedDB cursor, which the
 * iPhone has refused before.
 */
const app = initializeApp(FIREBASE_CONFIG)
const auth = initializeAuth(app, { persistence: browserLocalPersistence, popupRedirectResolver: browserPopupRedirectResolver })
const store = getFirestore(app)

export interface CloudUser {
  uid: string
  email: string | null
}

export function watchUser(listener: (user: CloudUser | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => listener(user ? { uid: user.uid, email: user.email } : null))
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth, new GoogleAuthProvider())
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password)
}

export async function createAccount(email: string, password: string): Promise<void> {
  await createUserWithEmailAndPassword(auth, email, password)
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email)
}

export async function signOutOfCloud(): Promise<void> {
  await signOut(auth)
}

const metaRef = (uid: string) => doc(store, 'users', uid, 'copy', 'current')
const chunkRef = (uid: string, id: string, index: number) => doc(store, 'users', uid, 'chunks', `${id}_${index}`)

async function dropChunks(uid: string, id: string, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) await deleteDoc(chunkRef(uid, id, index)).catch(() => undefined)
}

function readMetaFrom(data: Record<string, unknown>): CloudMeta {
  const previous = data.previous as { id?: unknown; chunks?: unknown } | null | undefined
  return {
    rev: Number(data.rev),
    id: String(data.id),
    chunks: Number(data.chunks),
    encoding: data.encoding === 'gzip' ? 'gzip' : 'plain',
    bytes: Number(data.bytes),
    updated_at: Number(data.updated_at),
    device: String(data.device ?? ''),
    entries: Number(data.entries ?? 0),
    empty: data.empty === true,
    previous: previous && typeof previous.id === 'string' ? { id: previous.id, chunks: Number(previous.chunks) } : null,
  }
}

export const cloud: Cloud = {
  async readMeta(uid) {
    const snapshot = await getDoc(metaRef(uid))
    if (!snapshot.exists()) return null
    const meta = readMetaFrom(snapshot.data())
    if (!Number.isFinite(meta.rev) || !Number.isFinite(meta.chunks)) throw new Error('The cloud copy is damaged.')
    return meta
  },

  async readChunks(uid, meta) {
    const parts: Uint8Array[] = []
    for (let index = 0; index < meta.chunks; index += 1) {
      const snapshot = await getDoc(chunkRef(uid, meta.id, index))
      if (!snapshot.exists()) throw new Error('Part of the cloud copy is missing.')
      parts.push((snapshot.data().data as Bytes).toUint8Array())
    }
    return parts
  },

  async write(uid, expectedRev, meta, chunks) {
    // The parts go up first under a new name; the revision only points at them once they are
    // all there, so a save that stops half-way leaves the earlier revision untouched.
    for (let index = 0; index < chunks.length; index += 1) {
      await setDoc(chunkRef(uid, meta.id, index), { data: Bytes.fromUint8Array(chunks[index]) })
    }
    const result = await runTransaction(store, async (transaction) => {
      const current = await transaction.get(metaRef(uid))
      const existing = current.exists() ? readMetaFrom(current.data()) : null
      if ((existing?.rev ?? null) !== expectedRev) return { status: 'stale' as const, drop: null }
      transaction.set(metaRef(uid), { ...meta, previous: existing ? { id: existing.id, chunks: existing.chunks } : null })
      return { status: 'ok' as const, drop: existing?.previous ?? null }
    })
    if (result.status === 'stale') {
      await dropChunks(uid, meta.id, chunks.length)
      return 'stale'
    }
    if (result.drop) await dropChunks(uid, result.drop.id, result.drop.chunks)
    return 'ok'
  },
}

const MESSAGES: Record<string, string> = {
  'auth/operation-not-allowed': 'This way of signing in is not switched on in the Firebase project.',
  'auth/unauthorized-domain': 'This address is not on the Firebase project’s list of authorised domains.',
  'auth/popup-blocked': 'The sign-in window was blocked. Allow pop-ups for this app, or sign in with email.',
  'auth/popup-closed-by-user': 'The sign-in window was closed before it finished.',
  'auth/cancelled-popup-request': 'The sign-in window was closed before it finished.',
  'auth/operation-not-supported-in-this-environment': 'Google sign-in does not work in this window. Sign in with email instead.',
  'auth/invalid-credential': 'The email or password is not right.',
  'auth/wrong-password': 'The email or password is not right.',
  'auth/user-not-found': 'There is no account with this email.',
  'auth/invalid-email': 'This is not an email address.',
  'auth/missing-password': 'Enter a password.',
  'auth/weak-password': 'The password needs at least 6 characters.',
  'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes, then try again.',
  'auth/network-request-failed': 'No connection.',
  'permission-denied': 'The cloud refused. The Firestore rules for this project are not in place yet.',
  unavailable: 'No connection.',
}

export function isOffline(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return code === 'unavailable' || code === 'auth/network-request-failed' || (typeof navigator !== 'undefined' && navigator.onLine === false)
}

export function describeError(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  if (typeof code === 'string' && MESSAGES[code]) return MESSAGES[code]
  return error instanceof Error ? error.message : String(error)
}
