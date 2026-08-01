import Link from "next/link";
import { AlertTriangle, GitPullRequest, MessagesSquare, Workflow } from "lucide-react";
import { AnimeStagger } from "@/components/motion/anime-stagger";
import { SpringReveal } from "@/components/motion/react-spring-reveal";
import { FocusPanel } from "@/components/workspace/focus-panel";
import { MetricStrip } from "@/components/workspace/metric-strip";
import { Timeline } from "@/components/workspace/timeline";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { integrationCatalog } from "@/features/integrations/catalog";
import { getDashboardState } from "@/lib/api-client";
import {
  buildIssueQueue,
  buildReviewQueue,
  latestSyncLabel,
  normalizeDashboardPayload,
  sourceEventCounts,
  sourceHealthByService,
} from "@/lib/dashboard-view-model";

export default async function DashboardPage() {
  const dashboardState = await getDashboardState();
  const dashboard = normalizeDashboardPayload(dashboardState.data?.dashboard);
  const reviewQueue = buildReviewQueue(dashboard.today.prsWaitingForReview.length ? dashboard.today.prsWaitingForReview : dashboard.events);
  const issueQueue = buildIssueQueue(dashboard.today.assignedIssues.length ? dashboard.today.assignedIssues : dashboard.events);
  const weeklySummary = dashboard.weeklySummary;
  const eventCounts = sourceEventCounts(dashboard.events);
  const healthByService = sourceHealthByService(dashboard.sourceHealth);
  const metrics = [
    { label: "Connected sources", value: dashboard.metrics.connectedSources.toString(), icon: Workflow },
    { label: "Waiting review", value: dashboard.metrics.waitingReview.toString(), icon: GitPullRequest },
    { label: "Cross-tool blockers", value: dashboard.metrics.crossToolBlockers.toString(), icon: AlertTriangle },
    { label: "Decisions found", value: dashboard.metrics.decisionsFound.toString(), icon: MessagesSquare },
  ];

  return (
    <SpringReveal className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">What matters now across code, planning, conversations, docs, and meetings.</p>
        </div>
        <Badge tone={dashboardState.error ? "red" : "green"}>
          {dashboardState.error ? "Gateway offline" : latestSyncLabel(dashboard)}
        </Badge>
      </div>
      {dashboardState.error ? (
        <Card className="border-[#4A2230] bg-[#22141C] p-4 text-sm text-[#FF9CAF]">{dashboardState.error}</Card>
      ) : null}
      <MetricStrip metrics={metrics} />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-base font-semibold">Pull requests</h2>
            <AnimeStagger className="mt-4 divide-y divide-border">
              {reviewQueue.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No pull request or review events in the latest sync.</p>
              ) : null}
              {reviewQueue.map((pr) => (
                <Link key={pr.id} href={`/integrations/${pr.service}`} className="block py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{pr.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {pr.source} · {pr.actor} · {pr.age}
                      </p>
                    </div>
                    <Badge tone={pr.status === "blocked" || pr.status === "checks_failed" ? "red" : "amber"}>
                      {pr.status.replace("_", " ")}
                    </Badge>
                  </div>
                </Link>
              ))}
            </AnimeStagger>
          </Card>
          <Timeline events={dashboard.events} />
        </div>
        <div className="space-y-6">
          <FocusPanel events={dashboard.events} focus={dashboard.focus} />
          <Card className="p-5">
            <h2 className="text-base font-semibold">Connected sources</h2>
            <AnimeStagger className="mt-4 space-y-3">
              {integrationCatalog.map((integration) => {
                const health = healthByService[integration.id];
                const connected = health?.status === "connected";
                return (
                  <Link
                    key={integration.id}
                    href={`/integrations/${integration.id}`}
                    className="flex items-center justify-between gap-3 rounded-md p-2 transition-colors hover:bg-accent"
                  >
                    <div>
                      <p className="text-sm font-medium">{integration.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(eventCounts[integration.id] ?? 0).toLocaleString()} events ·{" "}
                        {health?.status?.replaceAll("_", " ") ?? "not synced"}
                      </p>
                    </div>
                    <Badge tone={connected ? "green" : "neutral"}>{connected ? "On" : "Ready"}</Badge>
                  </Link>
                );
              })}
            </AnimeStagger>
          </Card>
          <Card className="p-5">
            <h2 className="text-base font-semibold">Weekly summary</h2>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-md bg-muted p-3">
                <dt className="text-muted-foreground">Merged PRs</dt>
                <dd className="mt-1 text-2xl font-semibold">{weeklySummary.mergedPrs.length}</dd>
              </div>
              <div className="rounded-md bg-muted p-3">
                <dt className="text-muted-foreground">Closed issues</dt>
                <dd className="mt-1 text-2xl font-semibold">{weeklySummary.closedIssues.length}</dd>
              </div>
              <div className="rounded-md bg-muted p-3">
                <dt className="text-muted-foreground">Decisions</dt>
                <dd className="mt-1 text-2xl font-semibold">{dashboard.metrics.decisionsFound}</dd>
              </div>
            </dl>
            <div className="mt-4 space-y-2">
              {weeklySummary.risks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No high-priority risks found in the latest sync.</p>
              ) : null}
              {weeklySummary.risks.map((risk) => (
                <p key={risk} className="text-sm text-muted-foreground">Risk: {risk}</p>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="text-base font-semibold">Assigned issues</h2>
            <AnimeStagger className="mt-4 space-y-3">
              {issueQueue.length === 0 ? (
                <p className="text-sm text-muted-foreground">No issue, ticket, or card events in the latest sync.</p>
              ) : null}
              {issueQueue.map((issue) => (
                <Link key={issue.id} href={`/integrations/${issue.service}`} className="block rounded-md border border-border p-3 transition-colors hover:bg-accent">
                  <p className="text-sm font-medium">{issue.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {issue.source} · {issue.actor} · {issue.priority}
                  </p>
                </Link>
              ))}
            </AnimeStagger>
          </Card>
        </div>
      </div>
    </SpringReveal>
  );
}
