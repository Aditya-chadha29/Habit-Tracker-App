import { useState, type ReactNode } from 'react'
import { TabBar, type TabKey } from './components/TabBar'
import { TodayScreen } from './screens/TodayScreen'
import { WeekScreen } from './screens/WeekScreen'
import { InsightsScreen } from './screens/InsightsScreen'
import { HabitsScreen } from './screens/HabitsScreen'

function Panel({ active, children }: { active: boolean; children: ReactNode }) {
  return <div className={active ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>{children}</div>
}

function App() {
  const [tab, setTab] = useState<TabKey>('today')

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[390px] flex-col overflow-hidden bg-ground text-ink pt-[env(safe-area-inset-top)]">
      <Panel active={tab === 'today'}>
        <TodayScreen />
      </Panel>
      <Panel active={tab === 'week'}>
        <WeekScreen />
      </Panel>
      <Panel active={tab === 'insights'}>
        <InsightsScreen />
      </Panel>
      <Panel active={tab === 'habits'}>
        <HabitsScreen />
      </Panel>
      <TabBar tab={tab} onChange={setTab} />
    </div>
  )
}

export default App
