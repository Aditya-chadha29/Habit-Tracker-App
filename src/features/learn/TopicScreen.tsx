import { useState } from "react"
import type { RouteProps } from "../../app/router"
import { formatMediumDate } from "../../engine/dates"
import { Button, IconButton } from "../../ui/Button"
import { Card, SectionTitle } from "../../ui/Card"
import { EmptyState } from "../../ui/EmptyState"
import { Page } from "../../ui/Page"
import { usePillars, useResources } from "./hooks"
import { PillarForm } from "./PillarsScreen"
import { ResourceForm, ResourceRow } from "./shared"

/**
 * Inside a topic: everything saved under it, in three plain groups. What is being worked on now,
 * what is waiting, and what is finished. A row opens the thing itself, where sessions are logged,
 * progress is kept and notes are written.
 */
export default function TopicScreen({ params }: RouteProps) {
  const pillars = usePillars()
  const resources = useResources()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const id = Number(params.id)
  const pillar = pillars.find((candidate) => candidate.id === id)

  if (!pillar) {
    return (
      <Page title="Topic" back="/learn" width="narrow">
        {pillars.length > 0 || resources.loaded ? <EmptyState icon="learn" title="That topic is no longer here." body="Go back to Learn to see the topics you have." /> : null}
      </Page>
    )
  }

  const mine = resources.list.filter((resource) => resource.pillar_id === id && resource.status !== "archived")
  const groups = [
    { title: "In progress", rows: mine.filter((resource) => resource.status === "in_progress") },
    { title: "To learn", rows: mine.filter((resource) => resource.status === "inbox" || resource.status === "shortlist" || resource.status === "queued") },
    { title: "Finished", rows: mine.filter((resource) => resource.status === "completed") },
  ].filter((group) => group.rows.length > 0)
  const finished = mine.filter((resource) => resource.status === "completed").length

  return (
    <Page
      title={pillar.name}
      subtitle={mine.length === 0 ? "Nothing saved yet" : mine.length + " saved · " + finished + " finished"}
      back="/learn"
      width="narrow"
      actions={
        <>
          <IconButton icon="edit" label="Rename, retire or delete this topic" onClick={() => setEditing(true)} />
          <Button variant="primary" size="sm" icon="plus" onClick={() => setAdding(true)}>
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {pillar.description && <p className="px-1 text-[13.5px] leading-relaxed text-ink-2">{pillar.description}</p>}
        {mine.length === 0 ? (
          <EmptyState
            icon="learn"
            title="Nothing saved under this topic."
            body="Add a book, a course, a video or an article to learn from. Each one keeps its own progress, sessions and notes."
            action={
              <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
                Add something to learn
              </Button>
            }
          />
        ) : (
          groups.map((group) => (
            <section key={group.title} className="flex flex-col gap-2">
              <SectionTitle>
                {group.title} · {group.rows.length}
              </SectionTitle>
              <Card padded={false} className="divide-y divide-line overflow-hidden">
                {group.rows.map((resource) => (
                  <div key={resource.id}>
                    <ResourceRow resource={resource} />
                    {resource.status === "completed" && (resource.completed_on || resource.verdict) && (
                      <p className="-mt-1 px-4 pb-2.5 text-[12.5px] leading-snug text-ink-3">
                        {[resource.completed_on ? "Finished " + formatMediumDate(resource.completed_on) : "", resource.verdict ?? ""].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                ))}
              </Card>
            </section>
          ))
        )}
      </div>
      {adding && <ResourceForm pillars={pillars} pillarId={id} onClose={() => setAdding(false)} />}
      {editing && <PillarForm pillar={pillar} count={mine.length} onClose={() => setEditing(false)} />}
    </Page>
  )
}
