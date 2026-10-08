import { Scene } from '../components/Scene'

/** What shows for the moment the record is being read: the name, quietly, over the lake. */
export function Splash() {
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-night">
      <Scene name="torii" fade="full" position="66% 50%" eager />
      <div className="relative flex flex-col items-center gap-3 px-8 text-center">
        <p className="font-display text-[30px] font-medium tracking-[0.32em] text-night-ink">IKIKATA</p>
        <span aria-hidden="true" className="h-px w-10 bg-accent" />
        <p className="text-[13px] tracking-[0.06em] text-night-ink/80">Your way of life.</p>
        <p role="status" className="mt-6 text-[12.5px] text-night-ink/60">
          Loading your data…
        </p>
      </div>
    </div>
  )
}
