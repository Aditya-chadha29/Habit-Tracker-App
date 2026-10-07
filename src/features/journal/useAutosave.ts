import { useEffect, useRef, useState } from 'react'

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

/**
 * Saves a little after typing stops, and again whenever the page might be about to go away: when
 * the field's owner unmounts, when the tab is hidden, when the page is being unloaded. The
 * service worker reloads the app when a new version arrives, so nothing typed may live only in
 * memory for long.
 *
 * `signature` is the content as a string; `save` is called with nothing and must read the latest
 * content itself (pass a function that closes over a ref, or over state via the latest render).
 */
export function useAutosave(signature: string, save: () => Promise<unknown>, delayMs = 700): SaveState {
  const [state, setState] = useState<SaveState>('idle')
  const saved = useRef(signature)
  const latest = useRef({ signature, save })
  latest.current = { signature, save }
  const timer = useRef<number | null>(null)

  const flush = useRef(async () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    const { signature: current, save: run } = latest.current
    if (current === saved.current) return
    saved.current = current
    setState('saving')
    try {
      await run()
      setState(latest.current.signature === saved.current ? 'saved' : 'pending')
    } catch {
      // Allow the next attempt to try again with the same content.
      saved.current = '\u0000unsaved'
      setState('error')
    }
  })

  useEffect(() => {
    if (signature === saved.current) return
    setState('pending')
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush.current(), delayMs)
  }, [signature, delayMs])

  useEffect(() => {
    const run = flush.current
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void run()
    }
    const onLeave = () => void run()
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onLeave)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onLeave)
      void run()
    }
  }, [])

  return state
}

export function saveStateLabel(state: SaveState): string {
  switch (state) {
    case 'pending':
    case 'saving':
      return 'Saving…'
    case 'saved':
      return 'Saved'
    case 'error':
      return 'Not saved. It will be tried again when you type.'
    case 'idle':
      return ''
  }
}
