import { useMemo, useState } from 'react'
import { SortableList } from '../../components/SortableList'
import { addPillar, deletePillar, reorderPillars, setPillarRetired, updatePillar } from '../../data/learningRepo'
import type { LearningPillar } from '../../data/types'
import { formatMediumDate } from '../../engine/dates'
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
        title={pillar ? 'Pillar' : 'New pillar'}
        size="sm"
        footer={
          <Button variant="primary" block onClick={save}>
            {pillar ? 'Save' : 'Add pillar'}
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
            ? `The pillar is removed for good. The ${count} ${count === 1 ? 'thing' : 'things'} saved under it ${count === 1 ? 'stays' : 'stay'}, without a pillar. To keep the pillar's name on them, retire it instead.`
            : 'The pillar is removed for good. Nothing is saved under it.'
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

/** Learn, for now, is the pillars: the few subjects everything studied is filed under. */
export default function PillarsScreen() {
  const toast = useToast()
  const pillars = usePillars()
  const resources = useResources()
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
      subtitle={`${active.length} ${active.length === 1 ? 'pillar' : 'pillars'}`}
      width="narrow"
      actions={
        <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing('new')}>
          Add
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {active.length === 0 ? (
          <EmptyState
            icon="learn"
            title="No pillars."
            body="A pillar is a subject you want to keep learning about."
            action={
              <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
                Add a pillar
              </Button>
            }
          />
        ) : (
          <SortableList
            items={active}
            idOf={(pillar) => pillar.id!}
            nameOf={(pillar) => pillar.name}
            onReorder={(ids) => {
              reorderPillars([...ids, ...retired.map((pillar) => pillar.id!)]).catch(() => toast.show('The order could not be saved.', { tone: 'risk' }))
            }}
          >
            {(pillar, i) => (
              <button
                type="button"
                onClick={() => setEditing(pillar)}
                className="flex min-h-[72px] w-full cursor-pointer items-center gap-3 py-3 pr-3 text-left transition-colors duration-100 hover:bg-surface-2"
              >
                <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-[14px] font-semibold text-on-accent', toneSolid(areaTone(pillar.color)))}>{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium text-ink">{pillar.name}</span>
                  {pillar.description && <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-ink-3">{pillar.description}</span>}
                </span>
              </button>
            )}
          </SortableList>
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

        <p className="px-1 text-[12.5px] leading-relaxed text-ink-3">Tap a pillar to rename, retire or delete it. Drag the handle, or use the arrows, to change the order.</p>
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
