import { Link } from '../app/router'
import type { Quote } from '../data/types'
import { cx } from '../ui/cx'

/**
 * The day's quote: one quiet line. It gives the screen its voice without taking it over — no
 * card chrome, no image, and it never appears in a banner or a toast.
 */
export function QuoteLine({ quote, className, linked = true, onScene = false }: { quote: Quote | null; className?: string; linked?: boolean; onScene?: boolean }) {
  if (!quote) return null
  const body = (
    <figure className={cx('max-w-[62ch]', className)}>
      <blockquote className={cx('font-display text-[16px] leading-relaxed font-medium lg:text-[19px]', onScene ? 'text-night-ink' : 'text-cream')}>“{quote.text}”</blockquote>
      {quote.author && <figcaption className={cx('mt-1.5 flex items-center gap-2 text-[12px] tracking-[0.04em]', onScene ? 'text-night-ink/80' : 'text-ink-2')}><span aria-hidden="true" className="h-px w-5 bg-accent" />{quote.author}</figcaption>}
    </figure>
  )
  if (!linked) return body
  return (
    <Link to="/quotes" aria-label={`Quote of the day: ${quote.text} — ${quote.author}. Open the quote library.`} className="block rounded-control">
      {body}
    </Link>
  )
}
