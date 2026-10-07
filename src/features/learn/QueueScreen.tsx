import { useMemo, useState } from 'react'
import { SortableList } from '../../components/SortableList'
import { addToQueue, moveResource, reorderQueue } from '../../data/learningRepo'
import type { LearningResource } from '../../data/types'
import { queueOf } from '../../engine/learning'
import { Button } from '../../ui/Button'
import { Card, SectionTitle } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { Page } from '../../ui/Page'
import { useToast } from '../../ui/Toast'
import { usePillars, useResources } from './hooks'
import { ResourceForm, ResourceRow } from './shared'

/**
 * The queue, and the two stages before it. Things move left to right — inbox, shortlist, queue —
 * and only when the owner moves them: saving something interesting never puts it straight into
 * tomorrow's learning.
 */
export default function QueueScreen() {
  const { list } = useResources()
  const pillars = usePillars()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const pillarById = useMemo(() => new Map(pillars.map((pillar) => [pillar.id!, pillar])), [pillars])
  const queue = useMemo(() => queueOf(list), [list])
  const byStatus = (status: LearningResource['status']) => list.filter((resource) => resource.status === status).sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title))
  const shortlist = byStatus('shortlist')
  const inbox = byStatus('inbox')
  const pillarOf = (resource: LearningResource) => (resource.pillar_id !== null ? pillarById.get(resource.pillar_id) : undefined)
  const fail = (error: unknown) => toast.show(error instanceof Error ? error.message : 'That could not be saved.', { tone: 'risk' })

  return (
    <Page
      title="Queue"
      back="/learn"
      subtitle={`${queue.length} in queue`}
      width="default"
      actions={
        <Button variant="primary" size="sm" icon="plus" onClick={() => setAdding(true)}>
          Add
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <SectionTitle>Queue · in the order it will be studied</SectionTitle>
          {queue.length === 0 ? (
            <EmptyState icon="learn" title="The queue is empty." body="Move something in from the shortlist or the inbox below." />
          ) : (
            <SortableList items={queue} idOf={(resource) => resource.id!} nameOf={(resource) => resource.title} onReorder={(ids) => reorderQueue(ids).catch(fail)}>
              {(resource, index) => (
                <ResourceRow
                  resource={resource}
                  pillar={pillarOf(resource)}
                  head={index === 0}
                  trailing={
                    <Button variant="ghost" size="sm" onClick={() => moveResource(resource.id!, 'shortlist').catch(fail)} aria-label={`Remove ${resource.title} from the queue`}>
                      Remove
                    </Button>
                  }
                />
              )}
            </SortableList>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <SectionTitle>Shortlist · {shortlist.length}</SectionTitle>
          {shortlist.length === 0 ? (
            <p className="px-1 text-[13.5px] text-ink-3">Things you genuinely intend to study, waiting for a place in the queue.</p>
          ) : (
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {shortlist.map((resource) => (
                <ResourceRow
                  key={resource.id}
                  resource={resource}
                  pillar={pillarOf(resource)}
                  trailing={
                    <Button variant="secondary" size="sm" onClick={() => addToQueue(resource.id!).catch(fail)} aria-label={`Add ${resource.title} to the queue`}>
                      Queue
                    </Button>
                  }
                />
              ))}
            </Card>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <SectionTitle>Inbox · {inbox.length}</SectionTitle>
          {inbox.length === 0 ? (
            <p className="px-1 text-[13.5px] text-ink-3">Anything you come across and add lands here first.</p>
          ) : (
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {inbox.map((resource) => (
                <ResourceRow
                  key={resource.id}
                  resource={resource}
                  pillar={pillarOf(resource)}
                  trailing={
                    <>
                      <Button variant="ghost" size="sm" onClick={() => moveResource(resource.id!, 'shortlist').catch(fail)} aria-label={`Shortlist ${resource.title}`}>
                        Shortlist
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => addToQueue(resource.id!).catch(fail)} aria-label={`Add ${resource.title} to the queue`}>
                        Queue
                      </Button>
                    </>
                  }
                />
              ))}
            </Card>
          )}
        </section>
      </div>
      {adding && <ResourceForm pillars={pillars} onClose={() => setAdding(false)} />}
    </Page>
  )
}
