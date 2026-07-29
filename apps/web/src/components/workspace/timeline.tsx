import {
  AlertTriangle,
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  GitCommitHorizontal,
  GitPullRequest,
  MessageSquareText,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { WorkEvent } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/dashboard-view-model";

const iconByEventHint = [
  { hint: "pull_request", icon: GitPullRequest },
  { hint: "review", icon: GitPullRequest },
  { hint: "commit", icon: GitCommitHorizontal },
  { hint: "check.failed", icon: ShieldAlert },
  { hint: "blocked", icon: AlertTriangle },
  { hint: "decision", icon: CheckCircle2 },
  { hint: "slack", icon: MessageSquareText },
  { hint: "notion", icon: BookOpenText },
  { hint: "calendar", icon: CalendarDays },
];

function iconForEvent(event: WorkEvent) {
  const searchable = `${event.service}.${event.type}`.toLowerCase();
  return iconByEventHint.find((item) => searchable.includes(item.hint))?.icon ?? CircleDot;
}

export function Timeline({ events }: { events: WorkEvent[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Activity</h2>
          <p className="text-sm text-zinc-500">Important normalized work events across connected services.</p>
        </div>
        <Badge tone="blue">Live</Badge>
      </div>
      <div className="mt-5 space-y-5">
        {events.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">
            No work events found yet. Run a sync after connecting services to populate the timeline.
          </p>
        ) : null}
        {events.map((event) => {
          const Icon = iconForEvent(event);
          return (
            <div key={event.id} className="flex gap-3">
              <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-600">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 border-b border-zinc-100 pb-5 last:border-b-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-zinc-950">{event.title}</h3>
                  <Badge tone={event.priority === "high" ? "red" : event.priority === "medium" ? "amber" : "neutral"}>
                    {event.priority}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-zinc-600">{event.summary}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  {event.source} · {event.actor} · {formatRelativeTime(event.occurredAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
