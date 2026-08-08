import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getIntegrationCatalogItem } from "@/features/integrations/catalog";
import { getSelectableResourcesState } from "@/lib/api-client";
import { ResourceSelectionForm } from "./resource-selection-form";

export default async function IntegrationResourcesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ connected?: string; selectionError?: string; sync?: string; syncError?: string }>;
}) {
  const { id } = await params;
  const paramsValue = await searchParams;
  const integration = getIntegrationCatalogItem(id);

  if (!integration) {
    notFound();
  }

  const resourcesState = await getSelectableResourcesState(integration.id);
  const payload = resourcesState.data;
  const Icon = integration.icon;
  const resourceConfig = integration.resources;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <a href="/settings" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-brand-primary">
        <ArrowLeft className="h-4 w-4" />
        Back to settings
      </a>

      <Card className="p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-brand-primary text-[#E9EDF7]">
              <Icon className="h-6 w-6" />
            </span>
            <div>
              <Badge tone={paramsValue?.connected ? "green" : payload?.status === "needs_auth" ? "amber" : "blue"}>
                {payload?.status?.replaceAll("_", " ") ?? "resource selection"}
              </Badge>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight">
                {resourceConfig?.title ?? `Select ${integration.name} resources`}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {resourceConfig?.description ??
                  "Choose exactly what Standup can sync. The dashboard will only use data from selected resources."}
              </p>
            </div>
          </div>
          <Button asChild variant="secondary">
            <a href={`/integrations/${integration.id}/connect`}>Reconnect {integration.name}</a>
          </Button>
        </div>
      </Card>

      {resourcesState.error ? <Card className="border-[#4A2230] bg-[#22141C] p-4 text-sm text-[#FF9CAF]">{resourcesState.error}</Card> : null}

      {paramsValue?.selectionError ? (
        <Card className="border-[#4A2230] bg-[#22141C] p-4 text-sm text-[#FF9CAF]">
          {decodeURIComponent(paramsValue.selectionError)}
        </Card>
      ) : null}

      {paramsValue?.syncError ? (
        <Card className="border-[#4A2230] bg-[#22141C] p-4 text-sm text-[#FF9CAF]">
          {decodeURIComponent(paramsValue.syncError)}
        </Card>
      ) : null}

      {paramsValue?.sync === "empty" ? (
        <Card className="border-[#4A3A18] bg-[#241F14] p-4 text-sm leading-6 text-[#F6C66A]">
          Slack connected and the sync ran, but no dashboard events were created. Make sure the selected channels contain
          decisions, blockers, mentions, or threads with links in the selected time window, and that the Standup app has
          been added to private channels.
        </Card>
      ) : null}

      {payload?.status === "rate_limited" ? (
        <Card className="border-[#4A3A18] bg-[#241F14] p-4 text-sm leading-6 text-[#F6C66A]">
          Slack is temporarily rate limiting channel listing. Standup is showing your saved channel selection, and you can retry
          once the Slack limit resets.
        </Card>
      ) : null}

      {payload?.status === "needs_auth" ? (
        <Card className="p-8 text-center">
          <h2 className="text-base font-semibold">Connect {integration.name} first</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            OAuth needs to complete before we can list selectable resources.
          </p>
          <Button asChild className="mt-5">
            <a href={`/integrations/${integration.id}/connect`}>Connect {integration.name}</a>
          </Button>
        </Card>
      ) : null}

      {payload && payload.status !== "needs_auth" && payload.resources.length === 0 ? (
        <Card className="p-8 text-center">
          <h2 className="text-base font-semibold">{resourceConfig?.emptyTitle ?? "Resource selection is not available yet"}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {resourceConfig?.emptyDescription ?? "This connector is connected, but it did not return selectable resources."}
          </p>
        </Card>
      ) : null}

      {payload && payload.resources.length > 0 ? (
        <ResourceSelectionForm
          integration={{ id: integration.id, resources: integration.resources }}
          resources={payload.resources}
          selectedResourceIds={payload.selectedResourceIds}
        />
      ) : null}
    </div>
  );
}
