import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { AnimeStagger } from "@/components/motion/anime-stagger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { getIntegrationCatalogItem } from "@/features/integrations/catalog";
import { getSelectableResourcesState } from "@/lib/api-client";
import { saveResourceSelectionAction } from "@/app/(workspace)/settings/actions";

export default async function IntegrationResourcesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ connected?: string }>;
}) {
  const { id } = await params;
  const paramsValue = await searchParams;
  const integration = getIntegrationCatalogItem(id);

  if (!integration) {
    notFound();
  }

  const resourcesState = await getSelectableResourcesState(integration.id);
  const payload = resourcesState.data;
  const selected = new Set(payload?.selectedResourceIds ?? []);
  const Icon = integration.icon;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/settings" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-brand-primary">
        <ArrowLeft className="h-4 w-4" />
        Back to settings
      </Link>

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
              <h1 className="mt-4 text-2xl font-semibold tracking-tight">Select {integration.name} resources</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Choose exactly what Standup can sync. The dashboard will only use data from selected resources.
              </p>
            </div>
          </div>
          <Button asChild variant="secondary">
            <a href={`/api/integrations/${integration.id}/connect`}>Reconnect</a>
          </Button>
        </div>
      </Card>

      {resourcesState.error ? <Card className="border-[#4A2230] bg-[#22141C] p-4 text-sm text-[#FF9CAF]">{resourcesState.error}</Card> : null}

      {payload?.status === "needs_auth" ? (
        <Card className="p-8 text-center">
          <h2 className="text-base font-semibold">Connect {integration.name} first</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            OAuth needs to complete before we can list selectable resources.
          </p>
          <Button asChild className="mt-5">
            <a href={`/api/integrations/${integration.id}/connect`}>Connect {integration.name}</a>
          </Button>
        </Card>
      ) : null}

      {payload && payload.status !== "needs_auth" && payload.resources.length === 0 ? (
        <Card className="p-8 text-center">
          <h2 className="text-base font-semibold">Resource selection is not available yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            This connector is connected, but it did not return selectable resources.
          </p>
        </Card>
      ) : null}

      {payload && payload.resources.length > 0 ? (
        <form action={saveResourceSelectionAction}>
          <input type="hidden" name="service" value={integration.id} />
          <Card className="overflow-hidden p-0">
            <div className="border-b border-brand-border p-5">
              <h2 className="text-base font-semibold">Available resources</h2>
              <p className="mt-1 text-sm text-muted-foreground">Select one or more resources to include in sync.</p>
            </div>
            <AnimeStagger className="divide-y divide-brand-border">
              {payload.resources.map((resource) => (
                <label key={resource.id} className="flex cursor-pointer items-start gap-4 p-4 hover:bg-brand-muted/50">
                  <Checkbox
                    name="resources"
                    defaultChecked={selected.has(resource.id)}
                    value={JSON.stringify(resource)}
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{resource.name}</span>
                      <Badge>{resource.type}</Badge>
                      {selected.has(resource.id) ? <CheckCircle2 className="h-4 w-4 text-[#6EE7B7]" /> : null}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{resource.externalUrl ?? resource.id}</span>
                  </span>
                </label>
              ))}
            </AnimeStagger>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-border bg-[#121826] p-4">
              <Button type="submit">Save selection</Button>
              <Button asChild variant="secondary">
                <Link href={`/integrations/${integration.id}`}>Open connector details</Link>
              </Button>
            </div>
          </Card>
        </form>
      ) : null}
    </div>
  );
}
