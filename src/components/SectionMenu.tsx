import {
  Activity,
  BarChart3,
  Brain,
  CalendarDays,
  ChevronLeft,
  Dumbbell,
  HeartPulse,
  House,
  LayoutGrid,
  List,
  ListOrdered,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import type { ComponentType } from 'react'

export type Section =
  | 'home'
  | 'today'
  | 'mind'
  | 'body'
  | 'exercise'
  | 'gym'
  | 'food'
  | 'week'
  | 'insights'
  | 'habits'

type IconType = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

/**
 * Every destination in the app. There is no tab bar: Home is the launcher, and this sheet is the
 * shortcut between sections, so moving from Gym to Food is still one tap from anywhere.
 */
export const SECTIONS: { key: Section; label: string; hint: string; Icon: IconType }[] = [
  { key: 'home', label: 'Home', hint: 'Dashboard', Icon: House },
  { key: 'today', label: 'Today', hint: 'Tick the day', Icon: List },
  { key: 'mind', label: 'Mind', hint: 'Meditation, paath', Icon: Brain },
  { key: 'body', label: 'Body', hint: 'Care, food, supplements', Icon: HeartPulse },
  { key: 'exercise', label: 'Exercise', hint: 'Daily movement', Icon: Activity },
  { key: 'gym', label: 'Gym', hint: 'Log a session', Icon: Dumbbell },
  { key: 'food', label: 'Food', hint: 'Meals, supplements', Icon: UtensilsCrossed },
  { key: 'week', label: 'Week', hint: 'Grid, weight, notes', Icon: CalendarDays },
  { key: 'insights', label: 'Insights', hint: 'Patterns', Icon: BarChart3 },
  { key: 'habits', label: 'Habits', hint: 'Add, retire, theme', Icon: ListOrdered },
]

const buttonPress = 'transition-transform duration-100 active:scale-[0.97] active:bg-accent/12'

export function MenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="All sections"
      title="All sections"
      className={`flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-[4px] border border-ink/20 bg-transparent text-ink/60 ${buttonPress}`}
    >
      <LayoutGrid size={16} strokeWidth={1.5} />
    </button>
  )
}

/** The thin bar above every section except Home: back on the left, the section menu on the right.
 *  No title — each screen already has its own header directly below this. */
export function TopBar({ onBack, onMenu }: { onBack: () => void; onMenu: () => void }) {
  return (
    <div className="flex flex-none items-center justify-between px-3 pt-1.5 pb-1">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to home"
        className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent text-accent ${buttonPress}`}
      >
        <ChevronLeft size={20} strokeWidth={1.5} />
      </button>
      <MenuButton onClick={onMenu} />
    </div>
  )
}

export function SectionSheet({
  open,
  current,
  onPick,
  onClose,
}: {
  open: boolean
  current: Section
  onPick: (section: Section) => void
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 cursor-pointer border-0 bg-ground/80"
      />
      <div className="relative mx-auto w-full max-w-[390px] border-t border-ink/16 bg-tabbar pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="text-[10.5px] tracking-[0.12em] text-ink/45 uppercase">Go to</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent text-ink/60 ${buttonPress}`}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1 px-3 pt-1 pb-4">
          {SECTIONS.map(({ key, label, hint, Icon }) => {
            const active = key === current
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onPick(key)
                  onClose()
                }}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-[4px] border bg-transparent px-3 text-left ${buttonPress} ${
                  active ? 'border-accent/45 text-accent' : 'border-ink/14 text-ink/72'
                }`}
              >
                <Icon size={18} strokeWidth={1.5} className="flex-none" />
                <span className="min-w-0">
                  <span className="block font-heading text-[14px] leading-tight">{label}</span>
                  <span className="block text-[10.5px] text-ink/42">{hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
