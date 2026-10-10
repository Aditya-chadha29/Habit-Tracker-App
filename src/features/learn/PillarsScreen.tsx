import { useMemo, useState } from 'react'
import { HabitRow } from '../../components/HabitRow'
import { moved, Reorderable } from '../../components/SortableList'
import { addPillar, deletePillar, reorderPillars, setPillarRetired, updatePillar } from '../../data/learningRepo'
import type { LearningPillar } from '../../data/types'
import { formatMediumDate } from '../../engine/dates'
import { dueItems } from '../../engine/score'
import { useCore } from '../../state/core'
import { Button } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { areaTone, toneSolid } from '../../ui/Chip'
import { cx } from '../../ui/cx'
import { EmptyState } from '../../ui/EmptyState'
import { Field, TextArea, TextInput } from '../../ui/Field'
import { ConfirmationDialog, Modal } from '../../ui/Overlay'
import { Page } from '../../ui/Page'
import { useToast } from '../../ui/Toast'
import { usePillars, useResources } from './hooks'

const COLORS = ['mind', 'learning', 'body', 'exercise', 'accent']

function PillarForm({ pillar, count, onClose }: { pillar: LearningPillar | null; count: number; onClose: () => void }) {
  const { today } = useCore()
  const toast = useToast()
  const [name, setName] = useState(pillar?.name ?? '')
  const [description, setDescription] = useState(pillar?.description ?? '')
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const fail = (problem: unknown) => toast.show(problem instanceof Error ? problem.message : 'That could not be saved.', { tone: 'risk' })

  const save = async () => {
    try {
      if (pillar) await updatePillar(pillar.id!, { name, description })
      else await addPillar(name, description, COLORS[count % COLORS.length])
      onClose()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That could not be saved.')
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={pillar ? 'Topic' : 'New topic'}
        size="sm"
        footer={
          <Button variant="primary" block onClick={save}>
            {pillar ? 'Save' : 'Add topic'}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Name" error={error || undefined}>
            <TextInput value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="Manufacturing" autoFocus={!pillar} />
          </Field>
          <Field label="What belongs in it" hint="Optional.">
            <TextArea autoGrow rows={2} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} />
          </Field>
          {pillar && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {pillar.retired_on === null ? (
                <Button variant="secondary" onClick={() => setPillarRetired(pillar.id!, today).then(onClose).catch(fail)}>
                  Retire
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setPillarRetired(pillar.id!, null).then(onClose).catch(fail)}>
                  Restore
                </Button>
              )}
              <Button variant="danger" onClick={() => setDeleting(true)}>
                Delete
              </Button>
            </div>
          )}
        </div>
      </Modal>
      <ConfirmationDialog
        open={deleting}
        title={`Delete ${pillar?.name ?? ''}?`}
        body={
          count > 0
            ? `The topic is removed for good. The ${count} ${count === 1 ? 'thing' : 'things'} saved under it ${count === 1 ? 'stays' : 'stay'}, without a topic. To keep the topic's name on them, retire it instead.`
            : 'The topic is removed for good. Nothing is saved under it.'
        }
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false)
          if (pillar) deletePillar(pillar.id!).then(onClose).catch(fail)
        }}
      />
    </>
  )
}

/** Learn, for now, is the topics: the few subjects everything studied is filed under. */
export default function PillarsScreen() {
  const toast = useToast()
  const pillars = usePillars()
  const resources = useResources()
  const { today: day, habits, index } = useCore()
  // The learning habits due today, shown here so they can be ticked without going to Today. It is
  // the same row and the same tick: done here is done there.
  const dueToday = useMemo(() => dueItems(habits, day, index).filter((item) => item.version.area === 'learning'), [habits, day, index])
  const [editing, setEditing] = useState<LearningPillar | 'new' | null>(null)

  const countOf = useMemo(() => {
    const counts = new Map<number, number>()
    for (const resource of resources.list) if (resource.pillar_id !== null) counts.set(resource.pillar_id, (counts.get(resource.pillar_id) ?? 0) + 1)
    return counts
  }, [resources.list])
  const active = pillars.filter((pillar) => pillar.retired_on === null)
  const retired = pillars.filter((pillar) => pillar.retired_on !== null)

  return (
    <Page
      title="Learn"
      width="narrow"
      backdrop={{ scene: 'balcony', at: 'top', position: '56% 40%', reveal: true }}
      actions={
        <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing('new')}>
          Add
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {dueToday.length > 0 && (
          <Card padded={false} className="divide-y divide-line overflow-hidden">
            {dueToday.map((item) => (
              <HabitRow key={item.habit.id} habit={item.habit} date={day} />
            ))}
          </Card>
        )}
        {active.length === 0 ? (
          <EmptyState
            icon="learn"
            title="No topics."
            body="A topic is a subject you want to keep learning about."
            action={
              <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
                Add a topic
              </Button>
            }
          />
        ) : (
          <Reorderable
            grid
            items={active}
            nameOf={(pillar) => pillar.name}
            onMove={(from, to) => {
              const ids = moved(active.map((pillar) => pillar.id!), from, to)
              reorderPillars([...ids, ...retired.map((pillar) => pillar.id!)]).catch(() => toast.show('The order could not be saved.', { tone: 'risk' }))
            }}
            className="grid grid-cols-2 gap-3 lg:gap-5"
            itemClassName="relative"
          >
            {(pillar, i, handle) => (
              <>
              <span className="absolute top-1.5 right-1">{handle}</span>
              <button
                type="button"
                onClick={() => setEditing(pillar)}
                className="flex min-h-[150px] w-full cursor-pointer flex-col items-start gap-3 rounded-card bg-surface p-4 text-left shadow-card transition-colors duration-100 hover:bg-surface-2 active:bg-surface-3"
              >
                <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-[16px] font-semibold text-on-accent', toneSolid(areaTone(pillar.color)))}>{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[17px] leading-snug font-semibold tracking-tight text-ink">{pillar.name}</span>
                  <span className="mt-1 block text-[12.5px] text-ink-3">
                    {(countOf.get(pillar.id!) ?? 0) === 0 ? 'Nothing saved yet' : `${countOf.get(pillar.id!)} saved`}
                  </span>
                </span>
              </button>
              </>
            )}
          </Reorderable>
        )}

        {retired.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionTitle>Retired</SectionTitle>
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {retired.map((pillar) => (
                <button
                  key={pillar.id}
                  type="button"
                  onClick={() => setEditing(pillar)}
                  className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors duration-100 hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] text-ink-2">{pillar.name}</span>
                    <span className="block text-[12.5px] text-ink-3">Retired {pillar.retired_on ? formatMediumDate(pillar.retired_on) : ''}</span>
                  </span>
                  <span className="text-[13px] font-medium text-accent-ink">Restore or delete</span>
                </button>
              ))}
            </Card>
          </section>
        )}

        <p className="px-1 text-[12.5px] leading-relaxed text-ink-3">Tap a topic to rename, retire or delete it. Drag the dots to change the order.</p>
      </div>

      {editing && (
        <PillarForm
          key={editing === 'new' ? 'new' : editing.id}
          pillar={editing === 'new' ? null : editing}
          count={editing === 'new' ? pillars.length : (countOf.get(editing.id!) ?? 0)}
          onClose={() => setEditing(null)}
        />
      )}
    </Page>
  )
}
