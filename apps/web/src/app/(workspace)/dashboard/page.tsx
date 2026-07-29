import Link from "next/link";
import { FocusPanel } from "@/components/workspace/focus-panel";
import { MetricStrip } from "@/components/workspace/metric-strip";
import { Timeline } from "@/components/workspace/timeline";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { integrations, issues, pullRequests, weeklySummary } from "@/lib/product-data";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-zinc-500">What matters now across code, planning, conversations, docs, and meetings.</p>
        </div>
        <Badge tone="green">Synced 6 min ago</Badge>
      </div>
      <MetricStrip />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-base font-semibold">Pull requests</h2>
            <div className="mt-4 divide-y divide-zinc-100">
              {pullRequests.map((pr) => (
                <Link key={pr.id} href={`/pull-requests/${pr.id}`} className="block py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{pr.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {pr.repository} #{pr.number} · {pr.author} · {pr.age}
                      </p>
                    </div>
                    <Badge tone={pr.status === "blocked" || pr.status === "checks_failed" ? "red" : "amber"}>
                      {pr.status.replace("_", " ")}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
          <Timeline />
        </div>
        <div className="space-y-6">
          <FocusPanel />
          <Card className="p-5">
            <h2 className="text-base font-semibold">Connected sources</h2>
            <div className="mt-4 space-y-3">
              {integrations.map((integration) => (
                <Link
                  key={integration.id}
                  href={`/integrations/${integration.id}`}
                  className="flex items-center justify-between gap-3 rounded-md p-2 transition-colors hover:bg-zinc-50"
                >
                  <div>
                    <p className="text-sm font-medium">{integration.name}</p>
                    <p className="text-xs text-zinc-500">{integration.events.toLocaleString()} events</p>
                  </div>
                  <Badge tone={integration.connected ? "green" : "neutral"}>{integration.connected ? "On" : "Ready"}</Badge>
                </Link>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="text-base font-semibold">Weekly summary</h2>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-md bg-zinc-50 p-3">
                <dt className="text-zinc-500">Merged PRs</dt>
                <dd className="mt-1 text-2xl font-semibold">{weeklySummary.mergedPrs}</dd>
              </div>
              <div className="rounded-md bg-zinc-50 p-3">
                <dt className="text-zinc-500">Closed issues</dt>
                <dd className="mt-1 text-2xl font-semibold">{weeklySummary.closedIssues}</dd>
              </div>
              <div className="rounded-md bg-zinc-50 p-3">
                <dt className="text-zinc-500">Decisions</dt>
                <dd className="mt-1 text-2xl font-semibold">{weeklySummary.decisions}</dd>
              </div>
            </dl>
            <div className="mt-4 space-y-2">
              {weeklySummary.risks.map((risk) => (
                <p key={risk} className="text-sm text-zinc-600">Risk: {risk}</p>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="text-base font-semibold">Assigned issues</h2>
            <div className="mt-4 space-y-3">
              {issues.map((issue) => (
                <Link key={issue.id} href={`/issues/${issue.id}`} className="block rounded-md border border-zinc-200 p-3">
                  <p className="text-sm font-medium">{issue.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {issue.repository} #{issue.number} · {issue.priority}
                  </p>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
