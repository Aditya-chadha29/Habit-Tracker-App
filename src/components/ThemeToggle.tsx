import { Palette } from 'lucide-react'
import { useTheme } from '../lib/theme'
import { THEME_OPTIONS, isThemePreference } from '../lib/themeOptions'

/**
 * Seven choices don't cycle well from one button, so the icon button fronts a native <select>:
 * the OS picker (a wheel on iOS) is the list, and it keeps full keyboard and screen-reader support.
 */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme()
  const label = THEME_OPTIONS.find((o) => o.id === preference)?.label ?? 'System'

  return (
    <label
      title={`Theme: ${label}`}
      className="relative flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-[4px] border border-ink/20 bg-transparent text-ink/60 transition-transform duration-100 active:scale-[0.97] active:bg-gold/12 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-gold"
    >
      <Palette size={16} strokeWidth={1.5} aria-hidden />
      <select
        aria-label="Theme"
        value={preference}
        onChange={(e) => {
          if (isThemePreference(e.target.value)) setPreference(e.target.value)
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {THEME_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
