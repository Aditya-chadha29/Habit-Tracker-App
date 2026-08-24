import { BarChart3, CalendarDays, List, ListOrdered } from 'lucide-react'
import type { ComponentType } from 'react'

export type TabKey = 'today' | 'week' | 'insights' | 'habits'

const TABS: { key: TabKey; label: string; Icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }[] = [
  { key: 'today', label: 'Today', Icon: List },
  { key: 'week', label: 'Week', Icon: CalendarDays },
  { key: 'insights', label: 'Insights', Icon: BarChart3 },
  { key: 'habits', label: 'Habits', Icon: ListOrdered },
]

export function TabBar({ tab, onChange }: { tab: TabKey; onChange: (t: TabKey) => void }) {
  return (
    <div className="flex flex-none border-t border-ink/16 bg-tabbar">
      {TABS.map(({ key, label, Icon }) => {
        const active = tab === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`flex min-h-[56px] flex-1 cursor-pointer flex-col items-center justify-center gap-1 border-0 bg-transparent py-2 transition-[color,background-color,transform] duration-100 active:scale-[0.97] active:bg-gold/12 ${
              active ? 'text-gold' : 'text-ink/42'
            }`}
          >
            <Icon size={19} strokeWidth={1.5} />
            <span className="font-heading text-[10.5px] tracking-[0.06em]">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
