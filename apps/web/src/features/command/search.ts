export type CommandKind = "destination" | "queue" | "source" | "person";

export type CommandItem = {
  id: string;
  kind: CommandKind;
  label: string;
  hint?: string;
  href: string;
};

export const DESTINATIONS: CommandItem[] = [
  { id: "today", kind: "destination", label: "Hoje", href: "/today" },
  { id: "queue", kind: "destination", label: "Fila", href: "/today?lane=action" },
  { id: "blocked", kind: "destination", label: "Bloqueado", href: "/today?lane=blocked" },
  { id: "timeline", kind: "destination", label: "Timeline", href: "/timeline" },
  { id: "weekly", kind: "destination", label: "Semana", href: "/weekly" },
  { id: "chat", kind: "destination", label: "Chat", href: "/chat" },
  { id: "sources", kind: "destination", label: "Fontes", href: "/settings" },
  { id: "settings", kind: "destination", label: "Preferências", href: "/settings" },
];

export const KIND_LABELS: Record<CommandKind, string> = {
  destination: "Ir para",
  queue: "Na fila",
  source: "Fontes",
  person: "Pessoas",
};

/**
 * Subsequence match: every character of the query appears in order. Typing
 * "flb" finds "Fila bloqueada" without requiring adjacency, which is what makes
 * a command line feel faster than a search box.
 */
export function fuzzyScore(query: string, candidate: string): number | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;

  const haystack = candidate.toLowerCase();
  let score = 0;
  let cursor = 0;
  let previous = -1;

  for (const char of needle) {
    const found = haystack.indexOf(char, cursor);
    if (found === -1) return null;

    // Consecutive characters and word starts are worth more than scattered hits.
    if (found === previous + 1) score += 3;
    if (found === 0 || haystack[found - 1] === " " || haystack[found - 1] === "/") score += 2;
    score += 1;

    previous = found;
    cursor = found + 1;
  }

  // Shorter candidates that matched are more likely to be what was meant.
  return score - haystack.length * 0.02;
}

export function searchCommands(items: CommandItem[], query: string, limit = 12): CommandItem[] {
  if (!query.trim()) {
    return items.filter((item) => item.kind === "destination");
  }

  return items
    .map((item) => ({ item, score: fuzzyScore(query, `${item.label} ${item.hint ?? ""}`) }))
    .filter((entry): entry is { item: CommandItem; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function groupByKind(items: CommandItem[]): { kind: CommandKind; items: CommandItem[] }[] {
  const order: CommandKind[] = ["destination", "queue", "source", "person"];
  return order
    .map((kind) => ({ kind, items: items.filter((item) => item.kind === kind) }))
    .filter((group) => group.items.length > 0);
}
