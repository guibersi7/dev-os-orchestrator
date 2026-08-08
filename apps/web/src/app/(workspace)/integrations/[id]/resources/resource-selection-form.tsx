"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Search } from "lucide-react";
import { AnimeStagger } from "@/components/motion/anime-stagger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { SelectableResource } from "@/lib/api-client";
import { saveResourceSelectionAction } from "@/app/(workspace)/settings/actions";

type ResourceSelectionFormProps = {
  integration: {
    id: string;
    resources?: {
      title: string;
      description: string;
      resourceSelectionLabel: string;
      firstSyncLabel: string;
      emptyTitle: string;
      emptyDescription: string;
      searchPlaceholder: string;
      setupQuestions: {
        contextScope: string;
        includeRecent: string;
        includeRecentHelp: string;
        extractionTypes: string;
        syncWindow: string;
      };
      extractionOptions: { value: string; label: string }[];
    };
  };
  resources: SelectableResource[];
  selectedResourceIds: string[];
};

export function ResourceSelectionForm({ integration, resources, selectedResourceIds }: ResourceSelectionFormProps) {
  const [query, setQuery] = useState("");
  const resourceConfig = integration.resources;
  const [includeRecent, setIncludeRecent] = useState(true);
  const [extractionTypes, setExtractionTypes] = useState(
    resourceConfig?.extractionOptions.map((option) => option.value) ?? [],
  );
  const [syncWindow, setSyncWindow] = useState("last_7_days");
  const [showInactiveChannels, setShowInactiveChannels] = useState(false);
  const selected = useMemo(() => new Set(selectedResourceIds), [selectedResourceIds]);
  const hasGuidedSetup = Boolean(resourceConfig);
  const isSlack = integration.id === "slack";
  const queryValue = query.trim().toLowerCase();
  const matchingResources = resources.filter((resource) => resourceMatchesQuery(resource, queryValue));
  const hiddenInactiveCount = isSlack
    ? matchingResources.filter((resource) => !selected.has(resource.id) && isInactiveSlackChannel(resource)).length
    : 0;
  const filteredResources = matchingResources
    .filter((resource) => !isSlack || showInactiveChannels || selected.has(resource.id) || !isInactiveSlackChannel(resource))
    .sort((a, b) => compareResources(a, b, selected));
  const settings = resourceConfig
    ? {
        [integration.id]: {
          includeRecent,
          extractionTypes,
          syncWindow,
        },
      }
    : undefined;

  return (
    <form action={saveResourceSelectionAction}>
      <input type="hidden" name="service" value={integration.id} />
      {settings ? <input type="hidden" name="settings" value={JSON.stringify(settings)} /> : null}

      {hasGuidedSetup && resourceConfig ? (
        <Card className="mb-6 p-5">
          <h2 className="text-base font-semibold">{resourceConfig.title}</h2>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium">{resourceConfig.setupQuestions.includeRecent}</p>
              <label className="mt-3 flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                <Checkbox
                  checked={includeRecent}
                  onCheckedChange={(checked) => setIncludeRecent(checked === true)}
                  className="mt-1"
                />
                <span>
                  Include when available.
                  <span className="mt-1 block text-xs leading-5">{resourceConfig.setupQuestions.includeRecentHelp}</span>
                </span>
              </label>
            </div>

            <div>
              <p className="text-sm font-medium">{resourceConfig.setupQuestions.syncWindow}</p>
              <select
                name="syncWindow"
                value={syncWindow}
                onChange={(event) => setSyncWindow(event.target.value)}
                className="mt-3 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              >
                <option value="last_7_days">Last 7 days</option>
                <option value="last_30_days">Last 30 days</option>
                <option value="from_now_on">From now on</option>
              </select>
            </div>

            <div className="lg:col-span-2">
              <p className="text-sm font-medium">{resourceConfig.setupQuestions.extractionTypes}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {resourceConfig.extractionOptions.map((option) => (
                  <label key={option.value} className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Checkbox
                      checked={extractionTypes.includes(option.value)}
                      onCheckedChange={(checked) =>
                        setExtractionTypes((current) =>
                          checked === true
                            ? [...new Set([...current, option.value])]
                            : current.filter((item) => item !== option.value),
                        )
                      }
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-brand-border p-5">
          <h2 className="text-base font-semibold">{resourceConfig?.resourceSelectionLabel ?? "Available resources"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {resourceConfig?.setupQuestions.contextScope ?? "Select one or more resources to include in sync."}
          </p>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={resourceConfig?.searchPlaceholder ?? "Search resources"}
              className="pl-9"
            />
          </div>
          {isSlack ? (
            <div className="mt-4 space-y-3 rounded-md border border-brand-border bg-brand-muted/40 p-3 text-xs leading-5 text-muted-foreground">
              <p>
                Private channels only appear when Slack grants access and the app has been added to the channel. If a
                private channel is missing, invite the Standup app to that channel and retry the connection.
              </p>
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={showInactiveChannels}
                  onCheckedChange={(checked) => setShowInactiveChannels(checked === true)}
                />
                <span>
                  Show inactive channels
                  {hiddenInactiveCount ? ` (${hiddenInactiveCount} hidden)` : ""}
                </span>
              </label>
            </div>
          ) : null}
        </div>

        {filteredResources.length ? (
          <AnimeStagger className="divide-y divide-brand-border">
            {filteredResources.map((resource) => {
              const inactive = isSlack && isInactiveSlackChannel(resource);
              const lastActivity = isSlack ? slackLastActivityLabel(resource) : "";

              return (
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
                      <Badge>{resource.type.replace("_", " ")}</Badge>
                      {inactive ? <Badge tone="amber">inactive</Badge> : null}
                      {selected.has(resource.id) ? <CheckCircle2 className="h-4 w-4 text-[#6EE7B7]" /> : null}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {lastActivity || resource.externalUrl || resource.id}
                    </span>
                  </span>
                </label>
              );
            })}
          </AnimeStagger>
        ) : (
          <div className="p-8 text-center">
            <h3 className="text-base font-semibold">No matches found</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Clear the search to review the full resource list.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-border bg-[#121826] p-4">
          <ResourceSelectionSubmitButton label={resourceConfig?.firstSyncLabel ?? "Save selection"} />
          <Button asChild variant="secondary">
            <a href={`/integrations/${integration.id}`}>Open connector details</a>
          </Button>
        </div>
      </Card>
    </form>
  );
}

function ResourceSelectionSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Starting sync..." : label}
    </Button>
  );
}

function resourceMatchesQuery(resource: SelectableResource, query: string) {
  if (!query) {
    return true;
  }
  const haystack = `${resource.name} ${resource.type} ${resource.id}`.toLowerCase();
  return haystack.includes(query);
}

function compareResources(a: SelectableResource, b: SelectableResource, selected: Set<string>) {
  const selectedDelta = Number(selected.has(b.id)) - Number(selected.has(a.id));
  if (selectedDelta !== 0) {
    return selectedDelta;
  }

  const inactiveDelta = Number(isInactiveSlackChannel(a)) - Number(isInactiveSlackChannel(b));
  if (inactiveDelta !== 0) {
    return inactiveDelta;
  }

  const activityDelta = slackLastActivityMs(b) - slackLastActivityMs(a);
  if (activityDelta !== 0) {
    return activityDelta;
  }

  return a.name.localeCompare(b.name);
}

function isInactiveSlackChannel(resource: SelectableResource) {
  const lastActivityMs = slackLastActivityMs(resource);
  if (!lastActivityMs) {
    return false;
  }
  const inactiveAfterMs = 1000 * 60 * 60 * 24 * 90;
  return Date.now() - lastActivityMs > inactiveAfterMs;
}

function slackLastActivityMs(resource: SelectableResource) {
  const value = resource.metadata?.lastActivityAt ?? resource.metadata?.updatedAt ?? resource.metadata?.createdAt;
  if (typeof value !== "string" || !value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function slackLastActivityLabel(resource: SelectableResource) {
  const lastActivityMs = slackLastActivityMs(resource);
  if (!lastActivityMs) {
    return resource.externalUrl ?? resource.id;
  }
  return `Last Slack channel signal ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(lastActivityMs)}`;
}
