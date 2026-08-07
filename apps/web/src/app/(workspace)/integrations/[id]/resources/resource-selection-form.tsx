"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
      resourceSelectionLabel: string;
      firstSyncLabel: string;
      setupQuestions: {
        contextChannels: string;
        privateChannels: string;
        privateChannelsHelp: string;
        extractionTypes: string;
        syncWindow: string;
      };
    };
  };
  resources: SelectableResource[];
  selectedResourceIds: string[];
};

const slackExtractionTypes = [
  ["decisions", "Decisions"],
  ["blockers", "Blockers"],
  ["mentions", "Mentions"],
  ["threads_with_links", "Threads with links"],
];

export function ResourceSelectionForm({ integration, resources, selectedResourceIds }: ResourceSelectionFormProps) {
  const [query, setQuery] = useState("");
  const [includePrivateChannels, setIncludePrivateChannels] = useState(true);
  const [extractionTypes, setExtractionTypes] = useState(["decisions", "blockers", "mentions", "threads_with_links"]);
  const [syncWindow, setSyncWindow] = useState("last_7_days");
  const selected = useMemo(() => new Set(selectedResourceIds), [selectedResourceIds]);
  const resourceConfig = integration.resources;
  const isSlack = integration.id === "slack" && resourceConfig;
  const filteredResources = resources.filter((resource) => {
    const haystack = `${resource.name} ${resource.type} ${resource.id}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const settings = isSlack
    ? {
        slack: {
          includePrivateChannels,
          extractionTypes,
          syncWindow,
        },
      }
    : undefined;

  return (
    <form action={saveResourceSelectionAction}>
      <input type="hidden" name="service" value={integration.id} />
      {settings ? <input type="hidden" name="settings" value={JSON.stringify(settings)} /> : null}

      {isSlack ? (
        <Card className="mb-6 p-5">
          <h2 className="text-base font-semibold">Slack setup</h2>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium">{resourceConfig.setupQuestions.privateChannels}</p>
              <label className="mt-3 flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                <Checkbox
                  checked={includePrivateChannels}
                  onCheckedChange={(checked) => setIncludePrivateChannels(checked === true)}
                  className="mt-1"
                />
                <span>
                  Include private channels when available.
                  <span className="mt-1 block text-xs leading-5">{resourceConfig.setupQuestions.privateChannelsHelp}</span>
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
                {slackExtractionTypes.map(([value, label]) => (
                  <label key={value} className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Checkbox
                      checked={extractionTypes.includes(value)}
                      onCheckedChange={(checked) =>
                        setExtractionTypes((current) =>
                          checked === true ? [...new Set([...current, value])] : current.filter((item) => item !== value),
                        )
                      }
                    />
                    {label}
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
            {isSlack ? resourceConfig.setupQuestions.contextChannels : "Select one or more resources to include in sync."}
          </p>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isSlack ? "Search Slack channels" : "Search resources"}
              className="pl-9"
            />
          </div>
        </div>

        {filteredResources.length ? (
          <AnimeStagger className="divide-y divide-brand-border">
            {filteredResources.map((resource) => (
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
        ) : (
          <div className="p-8 text-center">
            <h3 className="text-base font-semibold">No matches found</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Clear the search to review the full resource list.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-border bg-[#121826] p-4">
          <Button type="submit">{resourceConfig?.firstSyncLabel ?? "Save selection"}</Button>
          <Button asChild variant="secondary">
            <Link href={`/integrations/${integration.id}`}>Open connector details</Link>
          </Button>
        </div>
      </Card>
    </form>
  );
}
