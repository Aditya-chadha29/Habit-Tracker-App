import { useMemo, useState } from 'react'
import { addPillar, reorderPillars, setPillarRetired, updatePillar } from '../../data/learningRepo'
import type { LearningPillar, ResourceStatus, ResourceType } from '../../data/types'
import { STATUS_LABEL, TYPE_LABEL } from '../../engine/learning'
import { useCore } from '../../state/core'
import { Button, IconButton } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { EmptyState } from '../../ui/EmptyState'
import { Field, Select, TextInput } from '../../ui/Field'
import { Drawer } from '../../ui/Overlay'
import { Page } from '../../ui/Page'
import { Segmented } from '../../ui/Tabs'
import { useToast } from '../../ui/Toast'
import { usePillars, useResources } from './hooks'
import { ResourceForm, ResourceRow } from './shared'

const TYPE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'book', label: 'Books' },
  { id: 'video', label: 'Videos' },
  { id: 'article', label: 'Articles' },
  { id: 'pdf', label: 'PDFs' },
  { id: 'course', label: 'Courses' },
  { id: 'other', label: 'Other' },
] as const

type TypeFilter = (typeof TYPE_FILTERS)[number]['id']
const MAIN_TYPES: ResourceType[] = ['book', 'video', 'article', 'pdf', 'course']
const STATUSES: ResourceStatus[] = ['inbox', 'shortlist', 'queued', 'in_progress', 'completed', 'archived']
const COLORS = ['mind', 'learning', 'body', 'exercise', 'accent']

function PillarManager({ pillars, onClose }: { pillars: LearningPillar[]; onClose: () => void }) {
  const { today } = useCore()
  const toast = useToast()
  const [name, setName] = useState('')
  const fail = (error: unknown) => toast.show(error instanceof Error ? error.message : 'That could not be saved.', { tone: 'risk' })

  const move = (index: number, by: number) => {
    const target = index + by
    if (target < 0 || target >= pillars.length) return
    const ids = pillars.map((pillar) => pillar.id!)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorderPillars(ids).catch(fail)
  }

  return (
    <Drawer open onClose={onClose} title="Learning pillars">
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-ink-3">The subjects your learning is organised under. Rename, reorder, add or retire them freely; a retired pillar keeps its resources.</p>
        {pillars.map((pillar, index) => (
          <div key={pillar.id} className="flex flex-col gap-2 rounded-control bg-surface-2 p-3">
            <div className="flex items-center gap-1">
              <TextInput
                key={`${pillar.id}-${pillar.name}`}
                defaultValue={pillar.name}
                aria-label={`Name of pillar ${index + 1}`}
                maxLength={60}
                onBlur={(event) => {
                  if (event.target.value.trim() !== pillar.name) updatePillar(pillar.id!, { name: event.target.value }).catch(fail)
                }}
              />
              <IconButton icon="chevron-up" size="sm" label={`Move ${pillar.name} up`} disabled={index === 0} onClick={() => move(index, -1)} />
              <IconButton icon="chevron-down" size="sm" label={`Move ${pillar.name} down`} disabled={index === pillars.length - 1} onClick={() => move(index, 1)} />
            </div>
            <TextInput
              key={`${pillar.id}-description`}
              defaultValue={pillar.description}
              aria-label={`Description of ${pillar.name}`}
              placeholder="What belongs in it"
              maxLength={300}
              onBlur={(event) => {
                if (event.target.value.trim() !== pillar.description) updatePillar(pillar.id!, { description: event.target.value }).catch(fail)
              }}
            />
            <div className="flex items-center gap-2">
              <Select value={pillar.color} aria-label={`Colour of ${pillar.name}`} onChange={(event) => updatePillar(pillar.id!, { color: event.target.value }).catch(fail)}>
                {COLORS.map((color) => (
                  <option key={color} value={color}>
                    {color === 'mind' ? 'Violet' : color === 'learning' ? 'Blue' : color === 'body' ? 'Amber' : color === 'exercise' ? 'Green' : 'Accent'}
                  </option>
                ))}
              </Select>
              <Button variant="ghost" size="sm" onClick={() => setPillarRetired(pillar.id!, pillar.retired_on ? null : today).catch(fail)}>
                {pillar.retired_on ? 'Restore' : 'Retire'}
              </Button>
            </div>
          </div>
        ))}
        <Field label="Add a pillar">
          <div className="flex gap-2">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" maxLength={60} />
            <Button
              variant="primary"
              disabled={!name.trim()}
              onClick={() =>
                addPillar(name, '', 'accent')
                  .then(() => setName(''))
                  .catch(fail)
              }
            >
              Add
            </Button>
          </div>
        </Field>
      </div>
    </Drawer>
  )
}

/** Everything saved to learn from. A place to look things up and file them — not where the
 *  day's learning is decided; that is the queue's job. */
export default function LibraryScreen() {
  const { list } = useResources()
  const pillars = usePillars()
  const [query, setQuery] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [status, setStatus] = useState<ResourceStatus | 'all'>('all')
  const [pillar, setPillar] = useState<number | 'all'>('all')
  const [adding, setAdding] = useState(false)
  const [managing, setManaging] = useState(false)
  const pillarById = useMemo(() => new Map(pillars.map((p) => [p.id!, p])), [pillars])

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return list
      .filter((resource) => (type === 'all' ? true : type === 'other' ? !MAIN_TYPES.includes(resource.type) : resource.type === type))
      .filter((resource) => (status === 'all' ? resource.status !== 'archived' : resource.status === status))
      .filter((resource) => pillar === 'all' || resource.pillar_id === pillar)
      .filter((resource) => !needle || `${resource.title} ${resource.author} ${resource.topic} ${resource.source} ${resource.notes}`.toLowerCase().includes(needle))
      .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title))
  }, [list, query, type, status, pillar])

  return (
    <Page
      title="Library"
      back="/learn"
      subtitle={`${list.filter((resource) => resource.status !== 'archived').length} resources`}
      width="default"
      actions={
        <>
          <IconButton icon="sliders" label="Manage learning pillars" onClick={() => setManaging(true)} />
          <Button variant="primary" size="sm" icon="plus" onClick={() => setAdding(true)}>
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextInput type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, authors, topics, notes" aria-label="Search the library" />
        <Segmented options={TYPE_FILTERS} value={type} onChange={setType} label="Type of resource" size="sm" />
        <div className="grid grid-cols-2 gap-3">
          <Select value={status} aria-label="Status" onChange={(event) => setStatus(event.target.value as ResourceStatus | 'all')}>
            <option value="all">Every status but archived</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </Select>
          <Select value={pillar} aria-label="Pillar" onChange={(event) => setPillar(event.target.value === 'all' ? 'all' : Number(event.target.value))}>
            <option value="all">Every pillar</option>
            {pillars.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>

        {shown.length === 0 ? (
          <EmptyState
            icon="library"
            title={list.length === 0 ? 'The library is empty.' : 'Nothing matches these filters.'}
            body={list.length === 0 ? 'Add a book, a video, an article — anything you want to learn from.' : undefined}
            action={
              list.length === 0 ? (
                <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
                  Add a resource
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <p className="px-1 text-[12.5px] text-ink-3">
              {shown.length} {shown.length === 1 ? 'resource' : 'resources'}
              {type !== 'all' && ` · ${type === 'other' ? 'other types' : TYPE_LABEL[type]}`}
            </p>
            <Card padded={false} className="divide-y divide-line overflow-hidden">
              {shown.map((resource) => (
                <ResourceRow key={resource.id} resource={resource} pillar={resource.pillar_id !== null ? pillarById.get(resource.pillar_id) : undefined} />
              ))}
            </Card>
          </>
        )}
      </div>
      {adding && <ResourceForm pillars={pillars} type={type !== 'all' && type !== 'other' ? type : undefined} onClose={() => setAdding(false)} />}
      {managing && <PillarManager pillars={pillars} onClose={() => setManaging(false)} />}
    </Page>
  )
}
