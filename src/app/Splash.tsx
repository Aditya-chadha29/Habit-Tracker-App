import petals from '../assets/sakura-petals.webp'

/** What shows for the moment the record is being read: the name, quietly, over the blossom. */
export function Splash() {
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-ground">
      <img src={petals} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-55" />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-ground/80 via-ground/55 to-ground" />
      <div className="relative flex flex-col items-center gap-3 px-8 text-center">
        <p className="font-display text-[30px] font-medium tracking-[0.32em] text-cream">IKIKATA</p>
        <span aria-hidden="true" className="h-px w-10 bg-accent" />
        <p className="text-[13px] tracking-[0.06em] text-ink-2">Your way of life.</p>
        <p role="status" className="mt-6 text-[12.5px] text-ink-3">
          Loading your data…
        </p>
      </div>
    </div>
  )
}
