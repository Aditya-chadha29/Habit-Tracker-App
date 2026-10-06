import { useState } from 'react'
import { X } from 'lucide-react'
import { WEEKDAY_LABELS_MON_FIRST, todayLocalStr } from '../../lib/dates'
import { useSupplements } from '../../lib/hooks'
import {
  addSupplement,
  restoreSupplement,
  retireSupplement,
  updateSupplement,
} from '../../lib/mutations'
import type { Supplement, SupplementSchedule } from '../../lib/types'

const press = 'transition-transform duration-100 active:scale-[0.97] active:bg-accent/12'
const field =
  'rounded-[4px] border border-ink/20 bg-transparent px-2 py-2 text-[13px] text-ink focus:outline-none'

const SCHEDULES: { value: SupplementSchedule; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Once a week' },
  { value: 'as_needed', label: 'As needed' },
]

function Row({ supplement }: { supplement: Supplement }) {
  const id = supplement.id!
  const retired = Boolean(supplement.retired_on)

  return (
    <div className={`border-b border-ink/9 px-4 py-3 ${retired ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2">
        <input
          // Keyed on the row id so a live update elsewhere can't remount this mid-typing.
          key={`name-${id}`}
          defaultValue={supplement.name}
          aria-label="Name"
          onBlur={(e) => {
            const next = e.currentTarget.value.trim()
            if (next && next !== supplement.name) void updateSupplement(id, { name: next })
          }}
          className={`${field} min-w-0 flex-1`}
        />
        <input
          key={`dose-${id}`}
          defaultValue={supplement.dose_text}
          aria-label="Dose"
          placeholder="5 g"
          onBlur={(e) => {
            const next = e.currentTarget.value.trim()
            if (next !== supplement.dose_text) void updateSupplement(id, { dose_text: next })
          }}
          className={`${field} w-24 flex-none`}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={supplement.schedule}
          aria-label="How often"
          onChange={(e) => {
            const schedule = e.target.value as SupplementSchedule
            void updateSupplement(id, {
              schedule,
              // A weekly item with no day would never come due, so default it to Monday.
              weekly_day: schedule === 'weekly' ? (supplement.weekly_day ?? 0) : null,
            })
          }}
          className={`${field} flex-none`}
        >
          {SCHEDULES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        {supplement.schedule === 'weekly' && (
          <select
            value={supplement.weekly_day ?? 0}
            aria-label="Day of the week"
            onChange={(e) => void updateSupplement(id, { weekly_day: Number(e.target.value) })}
            className={`${field} flex-none`}
          >
            {WEEKDAY_LABELS_MON_FIRST.map((label, i) => (
              <option key={label} value={i}>
                {label}
              </option>
            ))}
          </select>
        )}

        <label className="flex flex-none items-center gap-1 text-[11px] text-ink/45">
          left
          <input
            key={`stock-${id}`}
            defaultValue={supplement.servings_left ?? ''}
            inputMode="numeric"
            aria-label="Servings left"
            placeholder="—"
            onBlur={(e) => {
              const raw = e.currentTarget.value.trim()
              const parsed = raw === '' ? null : Number.parseInt(raw, 10)
              if (raw !== '' && Number.isNaN(parsed as number)) return
              if (parsed !== supplement.servings_left) {
                void updateSupplement(id, {
                  servings_left: parsed,
                  // Tracking stock without a threshold would never warn, so give it one.
                  low_stock_at: parsed === null ? null : (supplement.low_stock_at ?? 10),
                })
              }
            }}
            className={`${field} w-14`}
          />
        </label>

        <button
          type="button"
          onClick={() => void (retired ? restoreSupplement(id) : retireSupplement(id))}
          className={`ml-auto min-h-[36px] flex-none cursor-pointer rounded-[4px] border border-ink/14 bg-transparent px-2.5 text-[11px] text-ink/42 ${press}`}
        >
          {retired ? 'Restore' : 'Retire'}
        </button>
      </div>
    </div>
  )
}

export function SupplementManager({ onClose }: { onClose: () => void }) {
  const supplements = useSupplements()
  const [name, setName] = useState('')
  const [dose, setDose] = useState('')

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const sortOrder = supplements.reduce((max, s) => Math.max(max, s.sort_order), -1) + 1
    await addSupplement({
      name: trimmed,
      dose_text: dose.trim(),
      schedule: 'daily',
      weekly_day: null,
      time_hint: 'anytime',
      servings_left: null,
      low_stock_at: null,
      created_on: todayLocalStr(),
      retired_on: null,
      sort_order: sortOrder,
    })
    setName('')
    setDose('')
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-grain">
      <div className="flex flex-none items-center justify-between border-b border-ink/14 px-4 py-2">
        <div className="font-heading text-[16px]">Supplements</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close supplements"
          className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent text-ink/60 ${press}`}
        >
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {supplements.map((supplement) => (
          <Row key={supplement.id} supplement={supplement} />
        ))}

        <div className="px-4 py-4">
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New supplement"
              className={`${field} min-w-0 flex-1`}
            />
            <input
              value={dose}
              onChange={(e) => setDose(e.target.value)}
              placeholder="Dose"
              className={`${field} w-24 flex-none`}
            />
          </div>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => void create()}
            className={`mt-2 min-h-[44px] w-full cursor-pointer rounded-[4px] border border-accent bg-transparent font-heading text-[14px] text-accent disabled:opacity-40 ${press}`}
          >
            Add
          </button>
          <p className="mt-2 text-[11px] leading-[1.5] text-ink/35">
            Retiring keeps every past tick — it only stops the item appearing from today forward.
          </p>
        </div>
      </div>
    </div>
  )
}
