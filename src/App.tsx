import { useState, type ReactNode } from 'react'
import { TabBar, type TabKey } from './components/TabBar'
import { TodayScreen } from './screens/TodayScreen'
import { WeekScreen } from './screens/WeekScreen'
import { InsightsScreen } from './screens/InsightsScreen'
import { HabitsScreen } from './screens/HabitsScreen'
import { useDoneMap, useHabits } from './lib/hooks'

function Panel({ active, children }: { active: boolean; children: ReactNode }) {
  return <div className={active ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>{children}</div>
}

function App() {
  const [tab, setTab] = useState<TabKey>('today')

  // Subscribed once here, not once per screen. All four screens stay mounted (to preserve each
  // one's own scroll position and nav state across tab switches), so four independent
  // useHabits()/useDoneMap() calls meant four separate Dexie live-query subscriptions all
  // re-running on every single write anywhere in the app, all the time, regardless of which tab
  // was actually visible — real, wasteful main-thread work on every tap that could contend with
  // an in-progress scroll gesture. One shared subscription, passed down as props, cuts that by 4x.
  const habits = useHabits()
  const doneMap = useDoneMap()

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[390px] flex-col overflow-hidden bg-grain text-ink pt-[env(safe-area-inset-top)]">
      <Panel active={tab === 'today'}>
        <TodayScreen habits={habits} doneMap={doneMap} />
      </Panel>
      <Panel active={tab === 'week'}>
        <WeekScreen habits={habits} doneMap={doneMap} />
      </Panel>
      <Panel active={tab === 'insights'}>
        <InsightsScreen habits={habits} doneMap={doneMap} active={tab === 'insights'} />
      </Panel>
      <Panel active={tab === 'habits'}>
        <HabitsScreen habits={habits} />
      </Panel>
      <TabBar tab={tab} onChange={setTab} />
    </div>
  )
}

export default App
