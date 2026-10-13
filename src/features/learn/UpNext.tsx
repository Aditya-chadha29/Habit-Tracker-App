import { navigate } from "../../app/router"
import { startResource } from "../../data/learningRepo"
import type { LearningPillar, LearningResource } from "../../data/types"
import { progressFraction, progressLabel, TYPE_LABEL } from "../../engine/learning"
import { formatDuration } from "../../engine/training"
import { useCore } from "../../state/core"
import { Button } from "../../ui/Button"
import { Card } from "../../ui/Card"
import { Icon } from "../../ui/icons"
import { ProgressBar } from "../../ui/Progress"
import { useNow } from "../train/hooks"
import { openResourceLink, TYPE_ICON } from "./shared"
import { startTimer, useLearnTimer } from "./timer"

/**
 * The one thing to pick up now: what is being timed, else what was started most recently, else
 * the oldest thing still waiting. One button starts it: the link opens, the clock starts, and the
 * item is marked as in progress.
 */
export function UpNext({ resources, pillars }: { resources: LearningResource[]; pillars: LearningPillar[] }) {
  const { today } = useCore()
  const timer = useLearnTimer()
  const now = useNow(timer !== null)
  const open = resources.filter((resource) => resource.status !== "completed" && resource.status !== "archived")
  const running = timer ? open.find((resource) => resource.id === timer.resourceId) : undefined
  const started = open.filter((resource) => resource.status === "in_progress").sort((a, b) => (b.started_on ?? "").localeCompare(a.started_on ?? "") || b.id! - a.id!)
  const waiting = [...open].sort((a, b) => a.created_on.localeCompare(b.created_on) || a.id! - b.id!)
  const pick = running ?? started[0] ?? waiting[0]
  if (!pick) return null

  const pillar = pillars.find((candidate) => candidate.id === pick.pillar_id)
  const fraction = progressFraction(pick)
  const where = progressLabel(pick)
  const label = running ? "Learning now" : pick.status === "in_progress" ? "Continue" : "Up next"
  const go = () => {
    if (!running) {
      openResourceLink(pick)
      startResource(pick.id!, today).catch(() => undefined)
      startTimer(pick.id!, Date.now())
    }
    navigate("/learn/resource/" + pick.id)
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-surface-2 text-ink-2">
          <Icon name={TYPE_ICON[pick.type]} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{label}</p>
          <h2 className="mt-1 line-clamp-2 text-[16.5px] leading-snug font-semibold text-ink">{pick.title}</h2>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-3">
            {TYPE_LABEL[pick.type]}
            {pillar ? " · " + pillar.name : ""}
            {where ? " · " + where : ""}
          </p>
        </div>
        {running && timer && (
          <span role="timer" aria-label="Time on this session" className="tnum shrink-0 text-[17px] font-semibold text-accent-ink">
            {formatDuration((now - timer.startedAt) / 1000)}
          </span>
        )}
      </div>
      {fraction !== null && fraction > 0 && fraction < 1 && <ProgressBar value={fraction} max={1} height={5} label={pick.title + ": " + Math.round(fraction * 100) + " percent"} />}
      <Button variant="primary" block icon={running ? undefined : "play"} onClick={go}>
        {running ? "Open to stop and log" : pick.status === "in_progress" ? "Continue" : "Start"}
      </Button>
    </Card>
  )
}
