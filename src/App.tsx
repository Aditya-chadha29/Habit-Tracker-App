import { useState, type ReactNode } from 'react'
import { SectionSheet, TopBar, type Section } from './components/SectionMenu'
import { HomeScreen } from './screens/HomeScreen'
import { TodayScreen } from './screens/TodayScreen'
import { CategoryScreen } from './screens/CategoryScreen'
import { WeekScreen } from './screens/WeekScreen'
import { InsightsScreen } from './screens/InsightsScreen'
import { HabitsScreen } from './screens/HabitsScreen'
import { GymScreen } from './screens/GymScreen'
import { FoodScreen } from './screens/FoodScreen'
import { useDoneMap, useHabits } from './lib/hooks'

function Panel({ active, children }: { active: boolean; children: ReactNode }) {
  return <div className={active ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>{children}</div>
}

function App() {
  // Home is both the dashboard and the launcher; there is no tab bar. Back returns here, and the
  // menu sheet jumps straight between sections.
  const [section, setSection] = useState<Section>('home')
  const [menuOpen, setMenuOpen] = useState(false)

  // Subscribed once here, not once per screen. All screens stay mounted (to preserve each one's
  // own scroll position and nav state across switches), so separate useHabits()/useDoneMap() calls
  // would mean separate Dexie live-query subscriptions all re-running on every single write
  // anywhere in the app, regardless of which section was actually visible — real, wasteful
  // main-thread work on every tap that could contend with an in-progress scroll gesture.
  const habits = useHabits()
  const doneMap = useDoneMap()

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[390px] flex-col overflow-hidden bg-grain text-ink pt-[env(safe-area-inset-top)]">
      {section !== 'home' && (
        <TopBar onBack={() => setSection('home')} onMenu={() => setMenuOpen(true)} />
      )}

      <Panel active={section === 'home'}>
        <HomeScreen
          habits={habits}
          doneMap={doneMap}
          onOpen={setSection}
          onMenu={() => setMenuOpen(true)}
        />
      </Panel>
      <Panel active={section === 'today'}>
        <TodayScreen habits={habits} doneMap={doneMap} />
      </Panel>
      <Panel active={section === 'mind'}>
        <CategoryScreen
          category="mind"
          title="Mind"
          blurb="Stillness and study"
          habits={habits}
          doneMap={doneMap}
        />
      </Panel>
      <Panel active={section === 'body'}>
        <CategoryScreen
          category="body"
          title="Body"
          blurb="Care, food and supplements"
          habits={habits}
          doneMap={doneMap}
        />
      </Panel>
      <Panel active={section === 'exercise'}>
        <CategoryScreen
          category="exercise"
          title="Exercise"
          blurb="Daily movement"
          habits={habits}
          doneMap={doneMap}
        />
      </Panel>
      <Panel active={section === 'gym'}>
        <GymScreen active={section === 'gym'} />
      </Panel>
      <Panel active={section === 'food'}>
        <FoodScreen />
      </Panel>
      <Panel active={section === 'week'}>
        <WeekScreen habits={habits} doneMap={doneMap} />
      </Panel>
      <Panel active={section === 'insights'}>
        <InsightsScreen habits={habits} doneMap={doneMap} active={section === 'insights'} />
      </Panel>
      <Panel active={section === 'habits'}>
        <HabitsScreen habits={habits} />
      </Panel>

      <SectionSheet
        open={menuOpen}
        current={section}
        onPick={setSection}
        onClose={() => setMenuOpen(false)}
      />
    </div>
  )
}

export default App
