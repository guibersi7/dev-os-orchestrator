"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { CommandItem } from "@/features/command/search";
import { KIND_LABELS, groupByKind, searchCommands } from "@/features/command/search";
import { loadQueueCommands } from "@/app/(workspace)/queue-commands";
import { cn } from "@/lib/utils";

/**
 * ⌘K is the navigation, not a search box: there is no sidebar and no tab bar,
 * so the zero-query state has to list the destinations before anything is
 * typed. Results are ranked in one flat list and only sectioned for reading.
 */
export function CommandPalette({ items }: { items: CommandItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  // Queue rows arrive after the first paint, so ⌘K never waits on the gateway.
  const [queueItems, setQueueItems] = useState<CommandItem[]>([]);
  const requested = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function loadQueue() {
    if (requested.current) return;
    requested.current = true;
    // A palette without queue rows is still a working palette, so a failure
    // here is silent rather than an error state over the navigation.
    void loadQueueCommands()
      .then(setQueueItems)
      .catch(() => setQueueItems([]));
  }

  // Opening always starts from a clean query, so the reset lives with the
  // action rather than in an effect watching `open`.
  function openPalette() {
    setQuery("");
    setCursor(0);
    setOpen(true);
    loadQueue();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => {
          if (current) return false;
          setQuery("");
          setCursor(0);
          loadQueue();
          return true;
        });
        return;
      }

      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const all = useMemo(() => [...items, ...queueItems], [items, queueItems]);
  const results = useMemo(() => searchCommands(all, query), [all, query]);
  const rows = useMemo(() => {
    // Free text always has somewhere to go: the last row hands it to chat.
    if (!query.trim()) return results;
    return [
      ...results,
      {
        id: "ask",
        kind: "destination" as const,
        label: `Perguntar: ${query.trim()}`,
        href: `/chat?q=${encodeURIComponent(query.trim())}`,
      },
    ];
  }, [results, query]);

  function go(item: CommandItem) {
    setOpen(false);
    router.push(item.href);
  }

  function onInputKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((current) => (current + 1) % Math.max(rows.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((current) => (current - 1 + rows.length) % Math.max(rows.length, 1));
    } else if (event.key === "Enter" && rows[cursor]) {
      event.preventDefault();
      go(rows[cursor]);
    }
  }

  // Grouping is presentational only — the keyboard walks one flat ranked list,
  // so each row carries the index it holds in `rows`.
  const grouped = groupByKind(rows).map((group) => ({
    ...group,
    items: group.items.map((item) => ({ item, index: rows.indexOf(item) })),
  }));

  return (
    <>
      <button
        aria-haspopup="dialog"
        className="flex h-[38px] w-full max-w-[520px] flex-1 items-center gap-2 rounded-[9px] border border-[#212938] bg-[#121826] px-3 text-left shadow-[0_8px_24px_-18px_rgba(0,0,0,.9)] transition-colors hover:border-[#39435A] hover:bg-[#141B2A]"
        onClick={openPalette}
        type="button"
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-[#79839B]" />
        <span className="flex-1 truncate text-[13px] text-[#79839B]">
          Ir para, filtrar ou perguntar sobre o trabalho…
        </span>
        <span className="font-mono shrink-0 rounded border border-[#212938] px-1.5 py-0.5 text-[11px] text-[#79839B]">
          ⌘K
        </span>
      </button>

      {open ? (
        <div
          aria-modal
          className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(8,12,21,.72)] px-5 pt-[12vh]"
          onClick={() => setOpen(false)}
          role="dialog"
        >
          <div
            className="w-full max-w-[560px] overflow-hidden rounded-[13px] border border-[#212938] bg-[#121826] shadow-[0_18px_44px_-20px_rgba(0,0,0,.9)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[#1B2230] px-4">
              <Search className="h-4 w-4 shrink-0 text-[#79839B]" />
              <input
                autoFocus
                ref={inputRef}
                className="h-12 flex-1 bg-transparent text-[14px] text-[#E9EDF7] outline-none placeholder:text-[#79839B]"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCursor(0);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Ir para, filtrar ou perguntar sobre o trabalho…"
                value={query}
              />
            </div>

            <div className="max-h-[52vh] overflow-y-auto py-2">
              {rows.length === 0 ? (
                <p className="px-4 py-6 text-[13px] text-[#8C96AD]">Nada corresponde a “{query}”.</p>
              ) : null}

              {grouped.map((group) => (
                <div key={group.kind}>
                  <p className="font-mono px-4 pb-1 pt-3 text-[10.5px] uppercase tracking-[0.06em] text-[#79839B]">
                    {KIND_LABELS[group.kind]}
                  </p>
                  {group.items.map(({ item, index }) => {
                    return (
                      <button
                        key={item.id}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors",
                          index === cursor ? "bg-[#1A2130]" : "hover:bg-[#141B2A]",
                        )}
                        onClick={() => go(item)}
                        onMouseEnter={() => setCursor(index)}
                        type="button"
                      >
                        <span className="truncate text-[13px] text-[#E9EDF7]">{item.label}</span>
                        {item.hint ? (
                          <span className="font-mono shrink-0 text-[11px] text-[#79839B]">{item.hint}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
