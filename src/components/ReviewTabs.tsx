import { navigate } from '../app/router'
import { Segmented } from '../ui/Tabs'

const SECTIONS = [
  { id: '/review', label: 'This week' },
  { id: '/progress', label: 'Progress' },
] as const

/** Review and Progress are one place: the week just lived, and the longer record behind it. */
export function ReviewTabs({ current }: { current: (typeof SECTIONS)[number]['id'] }) {
  return <Segmented options={SECTIONS} value={current} onChange={(to) => navigate(to, { replace: true })} label="Review section" block />
}
