"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BrandIcon } from "@/features/integrations/icons";
import type { SourceDef } from "@/features/wave-one/design-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  defaultSelection,
  searchResources,
  selectActiveOnly,
  selectionFor,
  summarize,
  toggleResource,
} from "@/features/setup/resource-selection";
import { cn } from "@/lib/utils";

const EVENT_TYPES = [
  "review_requested",
  "checks.failed",
  "issue.blocked",
  "thread.unanswered",
  "meeting.scheduled",
];

export function ResourcePicker({ sources }: { sources: SourceDef[] }) {
  const [activeId, setActiveId] = useState(sources[0]?.id);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState(() => defaultSelection(sources));
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const active = sources.find((source) => source.id === activeId) ?? sources[0];
  const summary = useMemo(() => summarize(sources, selection), [sources, selection]);
  const visible = useMemo(() => searchResources(active?.items ?? [], query), [active, query]);
  const activeSelected = selectionFor(selection, active?.id ?? "");

  function onTabKeyDown(event: React.KeyboardEvent, index: number) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;

    event.preventDefault();
    const next = sources[(index + delta + sources.length) % sources.length];
    setActiveId(next.id);
    setQuery("");
    tabRefs.current[next.id]?.focus();
  }

  if (!active) {
    return (
      <Card className="border-dashed border-[#2E3849] bg-[#0B0F1A] p-6">
        <p className="text-sm font-medium">No source is connected yet</p>
        <p className="mt-2 text-[13px] leading-normal text-[#9AA4BA]">
          Standup needs at least one authorized source before it can pick what to watch.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/setup/connect">Back to sources</Link>
        </Button>
      </Card>
    );
  }

  return (
    <section className="grid gap-8 lg:grid-cols-[minmax(420px,1fr)_300px] lg:gap-12">
      <div>
        <h1 className="text-balance text-[30px] font-semibold leading-[1.15] tracking-[-0.03em]">
          What should we watch?
        </h1>
        <p className="mt-3 text-[15px] leading-normal text-[#9AA4BA]">
          Per source, pick only what you actually work in. Noise here becomes noise in your morning.
        </p>

        <div className="mt-7 flex flex-wrap gap-2" role="tablist" aria-label="Connected sources">
          {sources.map((source, index) => {
            const isActive = source.id === active.id;
            return (
              <button
                key={source.id}
                ref={(node) => {
                  tabRefs.current[source.id] = node;
                }}
                aria-selected={isActive}
                role="tab"
                tabIndex={isActive ? 0 : -1}
                onClick={() => {
                  setActiveId(source.id);
                  setQuery("");
                }}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors",
                  isActive
                    ? "border-[#39435A] bg-[#1A2130] text-[#E9EDF7]"
                    : "border-[#212938] bg-[#121826] text-[#8C96AD] hover:border-[#39435A]",
                )}
              >
                <BrandIcon service={source.id} size={13} />
                {source.name}
                <span className="font-mono text-[11.5px] text-[#79839B]">
                  {summary.perSource.find((entry) => entry.id === source.id)?.selected ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <Input
          className="mt-5 h-11 border-[#212938] bg-[#121826]"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${active.count} ${active.resLabel.toLowerCase()}...`}
          value={query}
        />

        <div className="mt-5 flex items-center justify-between gap-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#79839B]">
            {active.resLabel} · {active.owner}
          </p>
          <button
            className="text-[12.5px] font-medium text-[var(--standup-accent-text)] hover:text-[#7FE3A8]"
            onClick={() => setSelection((current) => selectActiveOnly(current, active))}
            type="button"
          >
            Select only the active ones
          </button>
        </div>

        <Card className="mt-3 overflow-hidden border-[#212938]">
          {visible.length === 0 ? (
            <p className="p-4 text-[13px] text-[#8C96AD]">
              {query
                ? `No ${active.resLabel.toLowerCase()} match “${query}”.`
                : `This account has no ${active.resLabel.toLowerCase()} we can read.`}
            </p>
          ) : null}
          {visible.map((resource) => {
            const checked = activeSelected.has(resource.id);
            return (
              <label
                key={resource.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 border-b border-[#161C2B] p-4 last:border-b-0 hover:bg-[#141B2A]",
                  checked ? "bg-[#1A2130]" : "bg-[#121826]",
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => setSelection((current) => toggleResource(current, active.id, resource.id))}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{resource.name}</span>
                  <span className="font-mono mt-1 block truncate text-[11.5px] text-[#79839B]">{resource.meta}</span>
                </span>
                <span
                  className={cn(
                    "text-right text-[12.5px]",
                    resource.hot ? "text-[var(--standup-accent-text)]" : "text-[#79839B]",
                  )}
                >
                  {resource.signal}
                </span>
              </label>
            );
          })}
        </Card>
      </div>

      <Card className="h-fit border-[#212938] bg-[#0B0F1A] p-5 lg:sticky lg:top-6">
        <h2 className="text-sm font-semibold">First sync</h2>
        <div className="mt-4 space-y-2">
          {summary.perSource.map((entry) => (
            <div key={entry.id} className="flex justify-between gap-3 text-[12.5px]">
              <span className="text-[#9AA4BA]">{entry.name}</span>
              <span className="font-mono font-medium">
                {entry.selected} of {entry.total}
              </span>
            </div>
          ))}
        </div>
        <div className="my-4 border-t border-[#212938]" />
        <SummaryRow label="Resources total" value={summary.totalSelected.toString()} />
        <SummaryRow label="History window" value="30 days" />
        <SummaryRow label="Est. work events" value={summary.estimatedEvents.toLocaleString("en-US")} />
        <div className="mt-5 flex flex-wrap gap-1.5">
          {EVENT_TYPES.map((type) => (
            <span
              key={type}
              className="font-mono rounded bg-[var(--standup-accent-surface)] px-2 py-1 text-[10px] text-[var(--standup-accent-text)]"
            >
              {type}
            </span>
          ))}
        </div>
        <Button asChild className="mt-6 w-full" disabled={summary.totalSelected === 0}>
          <Link
            aria-disabled={summary.totalSelected === 0}
            className={cn(summary.totalSelected === 0 && "pointer-events-none opacity-50")}
            href={`/setup/sync?sources=${summary.perSource
              .filter((entry) => entry.selected > 0)
              .map((entry) => entry.id)
              .join(",")}`}
          >
            {summary.totalSelected === 1 ? "Sync 1 resource" : `Sync ${summary.totalSelected} resources`}
          </Link>
        </Button>
        <p className="mt-3 text-[12px] leading-normal text-[#79839B]">
          Sources sync in parallel. About 40 seconds. You can leave the page.
        </p>
      </Card>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 flex justify-between gap-3 text-[12.5px]">
      <span className="text-[#9AA4BA]">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}
