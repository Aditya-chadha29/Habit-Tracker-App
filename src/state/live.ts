import { useLiveQuery } from 'dexie-react-hooks'

/**
 * A live query that can never hand back another key's data.
 *
 * useLiveQuery keeps rendering the previous deps' result until the new one resolves. Fed into an
 * input's defaultValue, that stale value gets baked in and — if the field is then saved — written
 * onto the wrong week or day. That has corrupted real data in this app before. Carrying the key
 * inside the result and comparing it on the way out makes it unrepresentable.
 *
 * Callers must render a placeholder while `loaded` is false, and must never mount an uncontrolled
 * input from `data` before then.
 */
export function useKeyedLiveQuery<K extends string | number, T>(
  key: K,
  querier: (key: K) => Promise<T>,
): { data: T | undefined; loaded: boolean } {
  const result = useLiveQuery(async () => ({ key, data: await querier(key) }), [key])
  const fresh = result !== undefined && result.key === key
  return { data: fresh ? result.data : undefined, loaded: fresh }
}

/** A plain live query with a typed empty default while loading. */
export function useLive<T>(querier: () => Promise<T>, deps: unknown[], initial: T): T {
  return useLiveQuery(querier, deps) ?? initial
}
