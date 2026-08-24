import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type ThemePreference } from '../lib/theme'

const ORDER: ThemePreference[] = ['system', 'light', 'dark']
const ICONS = { system: Monitor, light: Sun, dark: Moon }
const LABELS: Record<ThemePreference, string> = {
  system: 'Theme: system',
  light: 'Theme: light',
  dark: 'Theme: dark',
}

export function ThemeToggle() {
  const { preference, setPreference } = useTheme()
  const Icon = ICONS[preference]

  return (
    <button
      type="button"
      onClick={() => setPreference(ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length])}
      aria-label={LABELS[preference]}
      title={LABELS[preference]}
      className="flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-[4px] border border-ink/20 bg-transparent text-ink/60"
    >
      <Icon size={16} strokeWidth={1.5} />
    </button>
  )
}
