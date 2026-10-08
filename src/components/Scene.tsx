import moonBlossom from '../assets/scene-moon-blossom.webp'
import mountain from '../assets/scene-mountain-moon.webp'
import torii from '../assets/scene-torii-lake.webp'
import toriiWide from '../assets/scene-torii-lake-wide.webp'
import { cx } from '../ui/cx'

/**
 * The scenery: one world of dusk, water and blossom, used in a few chosen places and never
 * behind a list or a number. Always decorative, so it is hidden from screen readers, and every
 * screen reads the same with it removed.
 *
 * A scene is night in both themes. Whatever sits on it uses the night tokens, not the theme's
 * ink, so the words stay light on dark even when the rest of the app is on paper.
 */
const SCENES = { mountain, torii, toriiWide, moonBlossom }
export type SceneName = keyof typeof SCENES

const FADES = {
  /** Words sit along the bottom. */
  up: 'bg-gradient-to-t from-night via-night/65 to-night/5',
  /** The picture is the point; only the edges are settled. */
  soft: 'bg-gradient-to-t from-night/70 via-night/10 to-night/25',
  /** Words sit in the middle of a full screen. */
  full: 'bg-gradient-to-b from-night/55 via-night/45 to-night',
}

interface SceneProps {
  name: SceneName
  fade?: keyof typeof FADES
  /** CSS object-position, to choose which part of the picture shows. */
  position?: string
  eager?: boolean
}

export function Scene({ name, fade = 'soft', position = 'center', eager = false }: SceneProps) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-night">
      <img src={SCENES[name]} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover" style={{ objectPosition: position }} />
      <div className={cx('absolute inset-0', FADES[fade])} />
    </div>
  )
}

/** A strip of scenery on its own: a place for the eye to rest between working parts of a screen. */
export function SceneBand({ name, position, className }: { name: SceneName; position?: string; className?: string }) {
  return (
    <div className={cx('relative h-[132px] overflow-hidden rounded-card shadow-card lg:h-[200px]', className)}>
      <Scene name={name} position={position} />
    </div>
  )
}
