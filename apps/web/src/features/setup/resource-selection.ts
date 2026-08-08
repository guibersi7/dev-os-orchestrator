import type { SourceDef, SourceResource } from "@/features/wave-one/design-data";

/**
 * Selection is keyed by source, never flattened: two sources can legitimately
 * expose resources with the same id, and the sticky summary has to sum across
 * sources without them colliding.
 */
export type ResourceSelection = Record<string, string[]>;

export type SelectionSummary = {
  perSource: { id: string; name: string; selected: number; total: number }[];
  totalSelected: number;
  estimatedEvents: number;
};

export function selectionFor(selection: ResourceSelection, sourceId: string): Set<string> {
  return new Set(selection[sourceId] ?? []);
}

export function toggleResource(selection: ResourceSelection, sourceId: string, resourceId: string): ResourceSelection {
  const current = selectionFor(selection, sourceId);
  if (current.has(resourceId)) {
    current.delete(resourceId);
  } else {
    current.add(resourceId);
  }

  return { ...selection, [sourceId]: [...current] };
}

/** "Select only the active ones" — the `hot` flag is the connector's own read of activity. */
export function selectActiveOnly(selection: ResourceSelection, source: SourceDef): ResourceSelection {
  return {
    ...selection,
    [source.id]: source.items.filter((item) => item.hot).map((item) => item.id),
  };
}

export function defaultSelection(sources: SourceDef[]): ResourceSelection {
  return Object.fromEntries(
    sources.map((source) => [source.id, source.items.filter((item) => item.hot).map((item) => item.id)]),
  );
}

export function searchResources(items: SourceResource[], query: string): SourceResource[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return items;
  }

  return items.filter((item) => `${item.name} ${item.meta}`.toLowerCase().includes(needle));
}

export function summarize(sources: SourceDef[], selection: ResourceSelection): SelectionSummary {
  const perSource = sources.map((source) => {
    const selected = selectionFor(selection, source.id);
    return {
      id: source.id,
      name: source.name,
      selected: source.items.filter((item) => selected.has(item.id)).length,
      total: source.items.length,
    };
  });

  const estimatedEvents = sources.reduce((total, source) => {
    const selected = selectionFor(selection, source.id);
    return total + source.items.filter((item) => selected.has(item.id)).reduce((sum, item) => sum + item.est, 0);
  }, 0);

  return {
    perSource,
    totalSelected: perSource.reduce((total, entry) => total + entry.selected, 0),
    estimatedEvents,
  };
}
