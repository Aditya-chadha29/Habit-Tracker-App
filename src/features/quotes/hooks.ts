import type { DateStr, Quote } from '../../data/types'

/** STUB — replaced by the Quotes feature. Signature is the contract other screens rely on. */
export function useQuoteOfDay(_date: DateStr): { loaded: boolean; quote: Quote | null } {
  return { loaded: false, quote: null }
}
