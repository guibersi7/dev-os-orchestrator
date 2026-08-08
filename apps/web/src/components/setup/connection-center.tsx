"use client";

import { useState } from "react";
import { BrandIcon } from "@/features/integrations/icons";
import type { SourceDef } from "@/features/wave-one/design-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { buildQueueHref } from "@/features/setup/oauth-queue";
import { cn } from "@/lib/utils";

/**
 * Generic over the source catalog: adding an eighth source is a catalog entry,
 * never a new screen. Nothing here names a specific product.
 */
export function ConnectionCenter({
  sources,
  recommendedId,
  initialSelection,
}: {
  sources: SourceDef[];
  recommendedId: SourceDef["id"];
  initialSelection: SourceDef["id"][];
}) {
  const [selected, setSelected] = useState<Set<SourceDef["id"]>>(new Set(initialSelection));

  function toggle(id: SourceDef["id"]) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Catalog order decides queue order, so the authorization sequence is stable
  // across reloads regardless of the order the user clicked things.
  const queue = sources.filter((source) => selected.has(source.id)).map((source) => source.id);
  const recommended = sources.find((source) => source.id === recommendedId);
  const rest = sources.filter((source) => source.id !== recommendedId);

  return (
    <>
      {recommended ? (
        <Card className="mt-8 border-[var(--standup-accent-border)] bg-[#121826] p-5">
          <SourceRow
            source={recommended}
            selected={selected.has(recommended.id)}
            onToggle={() => toggle(recommended.id)}
            emphasized
          />
        </Card>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-[13px] border border-[#212938] bg-[#121826]">
        {rest.map((source) => (
          <div key={source.id} className="border-b border-[#1B2230] p-4 last:border-b-0">
            <SourceRow source={source} selected={selected.has(source.id)} onToggle={() => toggle(source.id)} />
          </div>
        ))}
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#79839B]">
            Add now, or later from Settings
          </p>
          <p className="mt-1 text-[13px] text-[#9AA4BA]">Each source adds signal, not screens.</p>
        </div>
        <div className="text-right">
          <Button asChild disabled={queue.length === 0}>
            <a
              aria-disabled={queue.length === 0}
              href={queue.length === 0 ? "#" : buildQueueHref(queue, 0)}
              className={cn(queue.length === 0 && "pointer-events-none opacity-50")}
            >
              {queue.length === 1 ? "Authorize 1 tool" : `Authorize ${queue.length} tools`}
            </a>
          </Button>
          <p className="mt-2 max-w-[300px] text-[12.5px] text-[#79839B]">
            You will authorize them one after another. Each one takes about 20 seconds.
          </p>
        </div>
      </div>
    </>
  );
}

function SourceRow({
  source,
  selected,
  onToggle,
  emphasized = false,
}: {
  source: SourceDef;
  selected: boolean;
  onToggle: () => void;
  emphasized?: boolean;
}) {
  return (
    // The whole row is the target, and it is a real checkbox underneath so
    // keyboard and screen readers get the semantics for free.
    <label className="flex cursor-pointer items-center justify-between gap-5">
      <span className="flex items-center gap-3">
        <span
          className={cn(
            "flex items-center justify-center rounded-md bg-[#1A2130]",
            emphasized ? "h-10 w-10" : "h-8 w-8",
            selected ? "text-[var(--standup-accent-text)]" : "text-[#9AA4BA]",
          )}
        >
          <BrandIcon service={source.id} size={emphasized ? 20 : 16} />
        </span>
        <span>
          <span className="flex items-center gap-2">
            <span className={cn("font-semibold", emphasized ? "text-sm" : "text-[13.5px]")}>{source.name}</span>
            {emphasized ? (
              <span className="rounded-full bg-[var(--standup-accent-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--standup-accent-text)]">
                recommended
              </span>
            ) : null}
          </span>
          <span className="mt-1 block text-[12.5px] text-[#9AA4BA]">{source.unlocks}</span>
        </span>
      </span>

      <span
        className={cn(
          "flex shrink-0 items-center gap-2 text-[12.5px]",
          selected ? "text-[var(--standup-accent-text)]" : "text-[#79839B]",
        )}
      >
        {selected ? "Selected" : "Add"}
        <input checked={selected} onChange={onToggle} type="checkbox" className="peer sr-only" />
        <span
          aria-hidden
          className={cn(
            "h-[19px] w-[19px] rounded-[5px] border transition-colors peer-focus-visible:ring-[3px] peer-focus-visible:ring-[rgba(29,156,76,.32)]",
            selected
              ? "border-[var(--standup-accent)] bg-[var(--standup-accent)]"
              : "border-[#2E3849] bg-[#121826]",
          )}
        />
      </span>
    </label>
  );
}
