import { ArrowUpRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { WorkEvent } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/dashboard-view-model";

function buildFocusItems(events: WorkEvent[]) {
  return events
    .filter((event) => event.priority === "high" || event.type.toLowerCase().includes("blocked"))
    .slice(0, 3)
    .map((event) => ({
      title: event.title,
      reason: `${event.summary} ${event.source} · ${formatRelativeTime(event.occurredAt)}.`,
      action: event.service === "github" ? "Open repository context" : "Inspect source context",
      severity: event.priority === "high" ? "high" : "medium",
    }));
}

export function FocusPanel({ events }: { events: WorkEvent[] }) {
  const focusItems = buildFocusItems(events);

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-zinc-500" />
        <h2 className="text-base font-semibold">Focus</h2>
      </div>
      <div className="mt-5 space-y-4">
        {focusItems.length === 0 ? (
          <p className="rounded-md border border-dashed border-zinc-200 p-4 text-sm leading-6 text-zinc-500">
            No urgent blockers found in the latest synced work events.
          </p>
        ) : null}
        {focusItems.map((item) => (
          <div key={item.title} className="rounded-md border border-zinc-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <Badge tone={item.severity === "high" ? "red" : "amber"}>{item.severity}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{item.reason}</p>
            <Button variant="ghost" size="sm" className="mt-3 px-0">
              {item.action}
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
