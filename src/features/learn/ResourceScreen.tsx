import { useMemo, useState } from 'react'
import { navigate, type RouteProps } from '../../app/router'
import { db } from '../../data/db'
import {
  addToQueue, archiveResource, deleteLearningSession, deleteResourceCreatedToday, moveResource, restoreResource,
  setActiveBook, setResourceNotes, startResource,
} from '../../data/learningRepo'
import type { LearningLane } from '../../data/types'
import { formatFullDate, formatMediumDate } from '../../engine/dates'
import { isSafeUrl, progressFraction, progressLabel, queueOf, TYPE_LABEL } from '../../engine/learning'
import { isEditable } from '../../engine/lock'
import { useCore } from '../../state/core'
import { useKeyedLiveQuery } from '../../state/live'
import { Button, IconButton } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { EmptyState } from '../../ui/EmptyState'
import { Field, TextArea } from '../../ui/Field'
import { Icon } from '../../ui/icons'
import { ConfirmationDialog } from '../../ui/Overlay'
import { Page } from '../../ui/Page'
import { ProgressBar } from '../../ui/Progress'
import { useToast } from '../../ui/Toast'
import { usePillars, useResources } from './hooks'
import { metaLine, openResourceLink, PillarChip, ResourceForm, SessionSheet, StatusChip } from './shared'

/** One resource: what it is, how far through it you are, every session spent on it, and the
 *  actions that make sense for where it currently sits. */
export default function ResourceScreen({ params }: RouteProps) {
  const resourceId = Number(params.id)
  const { today, settings, write } = useCore()
  const toast = useToast()
  const { loaded, list } = useResources()
  const pillars = usePillars()
  const resource = list.find((candidate) => candidate.id === resourceId)
  const { data: sessions } = useKeyedLiveQuery(resourceId, async (id) =>
    (await db.learning_sessions.where('resource_id').equals(id).toArray()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.created_at - a.created_at)),
  )
  const [editing, setEditing] = useState(false)
  const [logging, setLogging] = useState<{ lane: LearningLane; finishing: boolean } | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)
  const queue = useMemo(() => queueOf(list), [list])

  if (loaded && !resource) {
    return (
      <Page title="Resource" back="/learn/library">
        <EmptyState title="That resource does not exist." />
      </Page>
    )
  }
  if (!resource) return <Page title="Resource" back="/learn/library">{null}</Page>

  const fail = (error: unknown) => toast.show(error instanceof Error ? error.message : 'That could not be done.', { tone: 'risk' })
  const run = (action: () => Promise<unknown>, message?: string) =>
    action()
      .then(() => message && toast.show(message))
      .catch(fail)
  const fraction = progressFraction(resource)
  const inQueue = queue.some((item) => item.id === resource.id)
  const place = queue.findIndex((item) => item.id === resource.id)
  const isBook = resource.type === 'book'
  const isActiveBook = settings.active_book_id === resource.id
  const lane: LearningLane = isActiveBook && !inQueue ? 'reading' : 'learning'
  const open = resource.status !== 'completed' && resource.status !== 'archived'

  return (
    <Page
      title={resource.title}
      subtitle={metaLine(resource)}
      back="/learn/library"
      width="default"
      actions={<IconButton icon="edit" label="Edit this resource" onClick={() => setEditing(true)} />}
    >
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
        <div className="flex flex-col gap-5 lg:col-span-7">
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <StatusChip status={resource.status} head={place === 0} />
              <Chip>{TYPE_LABEL[resource.type]}</Chip>
              <PillarChip pillar={resource.pillar_id !== null ? pillars.find((p) => p.id === resource.pillar_id) : undefined} />
              {inQueue && <Chip tone="accent">{place === 0 ? 'Today’s learning' : `Place ${place + 1} in the queue`}</Chip>}
              {isActiveBook && <Chip tone="mind">Active book</Chip>}
            </div>
            {(fraction !== null || resource.position_note) && (
              <div>
                {fraction !== null && <ProgressBar value={fraction} max={1} label={`${Math.round(fraction * 100)} percent complete`} />}
                <p className="mt-1.5 text-[13px] text-ink-2">{[progressLabel(resource), resource.position_note].filter(Boolean).join(' · ')}</p>
              </div>
            )}
            {resource.url && isSafeUrl(resource.url) && (
              <a href={resource.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[13.5px] font-medium break-all text-accent-ink">
                <Icon name="external" size={15} className="shrink-0" />
                {resource.url}
              </a>
            )}
            {resource.description && <p className="text-[14px] leading-relaxed text-ink-2">{resource.description}</p>}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              {[
                ['Topic', resource.topic],
                ['Priority', resource.priority === 1 ? 'High' : resource.priority === 3 ? 'Low' : 'Normal'],
                ['Added', formatFullDate(resource.created_on)],
                ['Started', resource.started_on ? formatFullDate(resource.started_on) : ''],
                ['Completed', resource.completed_on ? formatFullDate(resource.completed_on) : ''],
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-ink-3">{label}</dt>
                    <dd className="text-ink">{value}</dd>
                  </div>
                ))}
            </dl>
          </Card>

          {open && (
            <Card className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="primary"
                  icon={resource.url ? 'external' : 'play'}
                  onClick={() => {
                    openResourceLink(resource)
                    void run(() => startResource(resource.id!, today))
                  }}
                >
                  {resource.status === 'in_progress' ? 'Continue' : 'Start'}
                </Button>
                <Button variant="secondary" onClick={() => setLogging({ lane, finishing: false })}>
                  Log a session
                </Button>
                <Button variant="secondary" icon="check" onClick={() => setLogging({ lane, finishing: true })}>
                  Mark complete
                </Button>
                {inQueue ? (
                  <Button variant="secondary" onClick={() => run(() => moveResource(resource.id!, 'shortlist'), 'Moved to the shortlist.')}>
                    Remove from queue
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => run(() => addToQueue(resource.id!), 'Added to the end of the queue.')}>
                    Add to queue
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 border-t border-line pt-2">
                {resource.status === 'inbox' && (
                  <Button variant="ghost" size="sm" onClick={() => run(() => moveResource(resource.id!, 'shortlist'), 'Shortlisted.')}>
                    Shortlist
                  </Button>
                )}
                {resource.status === 'shortlist' && (
                  <Button variant="ghost" size="sm" onClick={() => run(() => moveResource(resource.id!, 'inbox'), 'Moved back to the inbox.')}>
                    Back to inbox
                  </Button>
                )}
                {isBook && (
                  <Button variant="ghost" size="sm" onClick={() => run(() => setActiveBook(isActiveBook ? null : resource.id!), isActiveBook ? 'No longer the active book.' : 'Now the active book.')}>
                    {isActiveBook ? 'Stop reading this' : 'Make this the active book'}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => run(() => archiveResource(resource.id!, today), 'Archived. It can be restored from the library.')}>
                  Archive
                </Button>
                {resource.created_on === today && (sessions ?? []).length === 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-risk"
                    onClick={() =>
                      deleteResourceCreatedToday(resource.id!, today)
                        .then(() => navigate('/learn/library', { replace: true }))
                        .catch(fail)
                    }
                  >
                    Delete
                  </Button>
                )}
              </div>
            </Card>
          )}

          {resource.status === 'archived' && (
            <Card className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-[14px] text-ink-2">Archived{resource.archived_on ? ` on ${formatFullDate(resource.archived_on)}` : ''}.</p>
              <Button variant="secondary" onClick={() => run(() => restoreResource(resource.id!), 'Restored to the shortlist.')}>
                Restore
              </Button>
            </Card>
          )}
          {resource.status === 'completed' && (
            <Card className="flex items-center gap-3">
              <Icon name="check-circle" size={20} className="shrink-0 text-ok" />
              <p className="min-w-0 flex-1 text-[14px] text-ink-2">Completed{resource.completed_on ? ` on ${formatFullDate(resource.completed_on)}` : ''}.</p>
              <Button variant="secondary" size="sm" onClick={() => run(() => addToQueue(resource.id!), 'Back in the queue.')}>
                Study again
              </Button>
            </Card>
          )}

          <Field label="Notes" hint="Saved when you leave the field.">
            <TextArea
              key={resource.id}
              autoGrow
              rows={3}
              defaultValue={resource.notes}
              placeholder="What is worth remembering"
              onBlur={(event) => {
                if (event.target.value.trim() !== resource.notes) setResourceNotes(resource.id!, event.target.value).catch(fail)
              }}
            />
          </Field>
        </div>

        <section className="flex flex-col gap-2 lg:col-span-5">
          <SectionTitle>Sessions · {(sessions ?? []).length}</SectionTitle>
          {(sessions ?? []).length === 0 ? (
            <p className="px-1 text-[13.5px] text-ink-3">No sessions logged yet.</p>
          ) : (
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {(sessions ?? []).map((session) => {
                const editable = isEditable(session.date, today, settings.edit_window_days)
                return (
                  <div key={session.id} className="flex items-start gap-2 py-2.5 pr-1 pl-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] text-ink">
                        {formatMediumDate(session.date)}
                        <span className="text-ink-3"> · {session.lane === 'reading' ? 'Reading' : 'Learning'}</span>
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-ink-3">
                        {[
                          session.minutes !== null ? `${session.minutes} min` : '',
                          session.progress_after !== session.progress_before ? `${session.progress_before} → ${session.progress_after}` : '',
                          session.completed_resource ? 'finished it' : '',
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Logged'}
                      </p>
                      {session.notes && <p className="mt-1 text-[13px] leading-snug text-ink-2">{session.notes}</p>}
                    </div>
                    {editable ? (
                      <IconButton icon="close" size="sm" label={`Remove the session of ${formatMediumDate(session.date)}`} onClick={() => setRemoving(session.id!)} />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center text-ink-3" title="Locked">
                        <Icon name="lock" size={13} label="Locked" />
                      </span>
                    )}
                  </div>
                )
              })}
            </Card>
          )}
        </section>
      </div>

      {editing && <ResourceForm resource={resource} pillars={pillars} onClose={() => setEditing(false)} />}
      {logging && <SessionSheet resource={resource} lane={logging.lane} finishing={logging.finishing} onClose={() => setLogging(null)} />}
      <ConfirmationDialog
        open={removing !== null}
        title="Remove this session?"
        body="The session is removed from the record and the resource goes back to where the remaining sessions leave it. That day will no longer count as a learning day unless another session exists."
        confirmLabel="Remove"
        tone="danger"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const id = removing
          setRemoving(null)
          if (id !== null) deleteLearningSession(id, write).catch(fail)
        }}
      />
    </Page>
  )
}
