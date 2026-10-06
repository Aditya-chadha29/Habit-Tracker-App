import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme'
import { THEME_OPTIONS, type ThemePreference } from '../lib/themeOptions'

const ORDER: ThemePreference[] = THEME_OPTIONS.map((o) => o.id)
const ICONS = { system: Monitor, light: Sun, dark: Moon }

export function ThemeToggle() {
  const { preference, setPreference } = useTheme()
  const Icon = ICONS[preference]
  const label = `Theme: ${preference}`

  return (
    <button
      type="button"
      onClick={() => setPreference(ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length])}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-[4px] border border-ink/20 bg-transparent text-ink/60 transition-transform duration-100 active:scale-[0.97] active:bg-accent/12"
    >
      <Icon size={16} strokeWidth={1.5} />
    </button>
  )
}
