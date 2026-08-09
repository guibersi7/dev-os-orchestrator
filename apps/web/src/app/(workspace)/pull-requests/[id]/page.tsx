import { notFound } from "next/navigation";
import { BriefingView } from "@/components/detail/briefing-view";
import { getActiveWorkspaceId, getDashboardState } from "@/lib/api-client";
import { normalizeDashboardPayload } from "@/lib/dashboard-view-model";
import { normalizeWorkEvents } from "@/lib/work-event";
import { buildBriefing } from "@/lib/detail/briefing";

export default async function PullRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspaceId = await getActiveWorkspaceId();
  const dashboardState = await getDashboardState(workspaceId);
  const dashboard = normalizeDashboardPayload(dashboardState.data?.dashboard);
  const events = normalizeWorkEvents(dashboard.events, workspaceId);

  const subject = events.find((event) => event.id === id || event.externalUrl === id);
  if (!subject) notFound();

  return (
    <BriefingView
      backHref={`/dashboard/${workspaceId}`}
      briefing={buildBriefing(events, subject)}
      openLabel="Revisar no GitHub"
    />
  );
}
