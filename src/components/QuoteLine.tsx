import { Link } from '../app/router'
import type { Quote } from '../data/types'
import { cx } from '../ui/cx'

/**
 * The day's quote: one quiet line. It gives the screen its voice without taking it over — no
 * card chrome, no image, and it never appears in a banner or a toast.
 */
export function QuoteLine({ quote, className, linked = true }: { quote: Quote | null; className?: string; linked?: boolean }) {
  if (!quote) return null
  const body = (
    <figure className={cx('max-w-[62ch]', className)}>
      <blockquote className="font-display text-[16px] leading-relaxed font-medium text-cream lg:text-[18px]">“{quote.text}”</blockquote>
      {quote.author && <figcaption className="mt-1.5 flex items-center gap-2 text-[12px] tracking-[0.04em] text-ink-2"><span aria-hidden="true" className="h-px w-5 bg-accent" />{quote.author}</figcaption>}
    </figure>
  )
  if (!linked) return body
  return (
    <Link to="/quotes" aria-label={`Quote of the day: ${quote.text} — ${quote.author}. Open the quote library.`} className="block rounded-control">
      {body}
    </Link>
  )
}
