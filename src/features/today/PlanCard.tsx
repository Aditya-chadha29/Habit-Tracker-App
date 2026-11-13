import { Link } from '../../app/router'
import { db } from '../../data/db'
import { PLAN_ITEM_LENGTH, PLAN_ITEMS, saveDayPlan } from '../../data/dayRepo'
import type { DayPlan } from '../../data/types'
import { addDays } from '../../engine/dates'
import { useCore } from '../../state/core'
import { useKeyedLiveQuery } from '../../state/live'
import { Card } from '../../ui/Card'
import { useToast } from '../../ui/Toast'

/**
 * The plan for the next day: up to three lines, written in the evening and shown back the next
 * morning. It sits beside the Journal and does not replace it.
 */
export function PlanCard() {
  const { today, hour, settings } = useCore()
  const toast = useToast()
  const evening = hour >= settings.evening_hour
  const date = evening ? addDays(today, 1) : today
  const { data: plan, loaded } = useKeyedLiveQuery(date, async (key): Promise<DayPlan | null> => (await db.day_plans.get(key)) ?? null)
  if (!loaded) return null

  if (!evening) {
    if (!plan || plan.items.length === 0) return null
    return (
      <section>
        <Card className="flex flex-col gap-2.5">
          <h2 className="eyebrow">Planned for today</h2>
          <ol className="flex flex-col gap-1.5">
            {plan.items.map((item, i) => (
              <li key={i} className="flex gap-2.5 text-[14.5px] leading-snug text-ink">
                <span className="tnum w-4 shrink-0 text-ink-3">{i + 1}</span>
                <span className="min-w-0 break-words">{item}</span>
              </li>
            ))}
          </ol>
        </Card>
      </section>
    )
  }

  const save = (form: HTMLFormElement | null) => {
    if (!form) return
    const items = new FormData(form).getAll('item').map(String)
    if (items.map((item) => item.trim()).filter(Boolean).join('\n') === (plan?.items ?? []).join('\n')) return
    saveDayPlan(date, items).catch(() => toast.show('The plan could not be saved.', { tone: 'risk' }))
  }

  return (
    <section>
      <Card className="flex flex-col gap-2.5">
        <h2 className="eyebrow">Tomorrow</h2>
        {/* Keyed on the day, never on the stored lines: a save must not remount a field mid-typing. */}
        <form key={date} className="flex flex-col gap-2" onSubmit={(event) => event.preventDefault()}>
          {Array.from({ length: PLAN_ITEMS }, (_, i) => (
            <label key={i} className="flex items-center gap-2.5">
              <span className="tnum w-4 shrink-0 text-[13px] text-ink-3">{i + 1}</span>
              <input
                name="item"
                type="text"
                defaultValue={plan?.items[i] ?? ''}
                maxLength={PLAN_ITEM_LENGTH}
                enterKeyHint="done"
                aria-label={`Plan for tomorrow, line ${i + 1}`}
                placeholder={i === 0 ? 'The one thing that matters tomorrow' : ''}
                onBlur={(event) => save(event.currentTarget.form)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
                className="h-11 min-w-0 flex-1 rounded-control bg-surface-2 px-3 text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)] focus:shadow-[inset_0_0_0_1.5px_var(--color-accent-ink)]"
              />
            </label>
          ))}
        </form>
        <Link to="/journal" className="inline-flex min-h-11 items-center self-start text-[13.5px] text-cream underline underline-offset-2">
          Write the journal
        </Link>
      </Card>
    </section>
  )
}
