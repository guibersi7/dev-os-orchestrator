import { SpringReveal } from "@/components/motion/react-spring-reveal";
import { ActionQueue } from "@/components/dashboard/action-queue";
import type { LaneFilter } from "@/components/dashboard/action-queue";
import { TodayBrief } from "@/components/dashboard/today-brief";
import { AllActivity, SignalBoard, SourceSignalList, WeeklyProgress } from "@/components/dashboard/context-rail";
import { IntegrationEmptyState } from "@/components/workspace/integration-empty-state";
import { Card } from "@/components/ui/card";
import { getConnectionsState, getDashboardState, getWorkspacesState } from "@/lib/api-client";
import { getInitialAuthSession } from "@/lib/auth-session";
import { normalizeDashboardPayload } from "@/lib/dashboard-view-model";
import { normalizeWorkEvents } from "@/lib/work-event";
import { buildQueue, countTrailingEvents } from "@/lib/queue/build";
import { buildViewerIdentity, isViewerActor } from "@/lib/viewer-identity";
import { buildDashboardNarrative } from "@/lib/dashboard/narrative";
import { buildRecentSignal, buildSourceRows, connectedCount, syncTone } from "@/lib/dashboard/rail";

type TodayScreenProps = {
  workspaceId: string;
  lane: LaneFilter;
};

export async function TodayScreen({ workspaceId, lane }: TodayScreenProps) {
  const [dashboardState, workspacesState, connectionsState, session] = await Promise.all([
    getDashboardState(workspaceId),
    getWorkspacesState(workspaceId),
    getConnectionsState(),
    getInitialAuthSession(),
  ]);

  const workspace = workspacesState.data?.workspaces.find((item) => item.id === workspaceId);
  const dashboard = normalizeDashboardPayload(dashboardState.data?.dashboard);
  const events = normalizeWorkEvents(dashboard.events, workspaceId);

  // A failed connections call costs personalization, never the screen.
  const identity = buildViewerIdentity(session.user, connectionsState.data?.connections ?? [], events);
  const queue = buildQueue(events, { isViewer: (event) => isViewerActor(event, identity) });
  const shown = lane === "all" ? queue : queue.filter((item) => item.lane === lane);

  const narrative = buildDashboardNarrative(dashboard, queue, { viewerResolved: identity.resolved });
  const signal = buildRecentSignal(events, queue);
  const sourceRows = buildSourceRows(dashboard, events);
  const connected = connectedCount(dashboard);
  const trailing = countTrailingEvents(events, queue);

  const lastSync = dashboard.sourceHealth
    .map((source) => source.lastSyncedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  const hasConnectedSources = connected > 0 || dashboard.metrics.connectedSources > 0;
  const isEmptyWorkspace = !dashboardState.error && !hasConnectedSources && events.length === 0;

  return (
    <SpringReveal className="mx-auto min-w-0 max-w-[1240px] px-5 pb-[72px] pt-[26px]">
        {dashboardState.error ? (
          <Card className="mb-6 border-[#3A2130] bg-[#22141C] p-4 text-sm text-[#FF8FA6]">{dashboardState.error}</Card>
        ) : null}

        {isEmptyWorkspace ? (
          <IntegrationEmptyState
            actionLabel="Connect GitHub"
            description="No connected integrations or synced events were found for this workspace. Start with GitHub, then add planning, docs, and messaging sources as needed."
            service="github"
            title="Connect an app to populate this dashboard"
          />
        ) : (
          <>
            <TodayBrief
              narrative={narrative}
              syncLabel={lastSync ? `Sync ${new Date(lastSync).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Sem sync"}
              syncTone={syncTone(lastSync ?? undefined, Boolean(dashboardState.error))}
              viewerResolved={identity.resolved}
              workspaceName={workspace?.name ?? "Dashboard"}
            />

            <div className="mt-7 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="min-w-0 space-y-6">
                <ActionQueue
                  active={lane}
                  all={queue}
                  items={shown}
                  trailingNote={
                    trailing > 0
                      ? `${trailing} ${trailing === 1 ? "outro evento hoje" : "outros eventos hoje"}, nenhum bloqueando outra pessoa.`
                      : ""
                  }
                />
              </div>

              <div className="min-w-0 space-y-6">
                <SignalBoard groups={signal} />
                <WeeklyProgress
                  activeWork={dashboard.weeklySummary.activeWork.length}
                  closedIssues={dashboard.weeklySummary.closedIssues.length}
                  decisions={dashboard.metrics.decisionsFound}
                  mergedPrs={dashboard.weeklySummary.mergedPrs.length}
                  risks={dashboard.weeklySummary.risks}
                />
                <SourceSignalList connected={connected} rows={sourceRows} />
                <AllActivity events={dashboard.events} />
              </div>
            </div>
          </>
        )}
    </SpringReveal>
  );
}
