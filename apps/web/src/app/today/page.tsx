import Link from "next/link";
import { MessageSquare, Search } from "lucide-react";
import { AnimeStagger } from "@/components/motion/anime-stagger";
import { SpringReveal } from "@/components/motion/react-spring-reveal";
import { BrandMark } from "@/components/brand/brand-mark";
import { HeaderAuthControl } from "@/components/auth/header-auth-control";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { defaultConnectedIds, focusQueue, sources } from "@/features/wave-one/design-data";

const nav = [
  ["Today", "3"],
  ["Focus queue", "7"],
  ["Timeline", ""],
  ["Weekly summary", ""],
  ["Chat", ""],
  ["Connections", "3/7"],
  ["Settings", ""],
];

const waiting = [
  { title: "PR #39 · Normalize Linear payloads", detail: "Waiting on Tainá since yesterday", age: "1d", color: "#6A7489" },
  { title: "DEV-14 · Rate limit strategy", detail: "Waiting on infra review", age: "3d", color: "#FF9CAF" },
  { title: "PR #44 · Event dedupe", detail: "Approved, waiting on CI", age: "20m", color: "#6A7489" },
];

const agenda = [
  { time: "11:30", title: "Platform sync", meta: "4 people · 30m", bar: "var(--standup-accent)" },
  { time: "13:00", title: "Design review · connectors", meta: "Optional · 45m", bar: "var(--standup-accent-surface)" },
  { time: "14:00", title: "Open", meta: "No meetings until 16:40", bar: "#212938" },
];

const blocking = [
  { title: "Ana · shipping DEV-18", detail: "Blocked by PR #42 for 2 days. Sprint 1 ends Friday." },
  { title: "Rafa · connector retries", detail: "Waiting on a decision in the platform thread." },
];

export default function TodayPage() {
  const connected = sources.filter((source) => defaultConnectedIds.includes(source.id));
  const missing = sources.filter((source) => !defaultConnectedIds.includes(source.id));

  return (
    <main className="min-h-screen overflow-x-auto bg-[#080C15] text-[#E9EDF7]">
      <div className="grid min-w-[940px] grid-cols-[216px_minmax(0,1fr)]">
        <aside className="min-h-screen border-r border-[#212938] bg-[#0B0F1A] p-4">
          <Link href="/today" className="flex items-center gap-2">
            <BrandMark />
            <span>
              <span className="block text-sm font-semibold">Bersi Labs</span>
              <span className="block text-[11px] text-[#6A7489]">Standup</span>
            </span>
          </Link>
          <button className="mt-6 flex h-9 w-full items-center justify-between rounded-lg border border-[#212938] bg-[#121826] px-3 text-left text-[12.5px] text-[#6A7489]">
            <span className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5" />
              Search or ask...
            </span>
            <span className="font-mono">⌘K</span>
          </button>
          <nav className="mt-5 space-y-1">
            {nav.map(([label, badge], index) => {
              const href = label === "Chat" ? "/chat" : label === "Settings" || label === "Connections" ? "/settings" : "/today";

              return (
                <a
                  key={label}
                  href={href}
                  className={`flex h-9 items-center justify-between rounded-lg px-3 text-[13px] ${index === 0 ? "bg-[var(--standup-accent-surface)] font-medium text-[var(--standup-accent-text)]" : "text-[#9AA4BA] hover:bg-[#121826]"}`}
                >
                  <span>{label}</span>
                  {badge ? <span className="font-mono text-[11px]">{badge}</span> : null}
                </a>
              );
            })}
          </nav>
          <Card className="mt-8 border-[#212938] bg-[#121826] p-4">
            <p className="text-sm font-semibold">{connected.length} of 7 sources connected</p>
            <p className="mt-2 text-[12.5px] leading-normal text-[#6A7489]">Enough signal to rank your morning across tools.</p>
            <Button asChild variant="outline" size="sm" className="mt-4 w-full">
              <Link href="/setup/connect">Add a tool</Link>
            </Button>
          </Card>
        </aside>

        <SpringReveal className="p-7">
          <header>
            <div className="flex items-start justify-between gap-6">
              <div>
                <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.03em]">Good morning, Guilherme</h1>
                <p className="font-mono mt-2 text-[12px] text-[#6A7489]">tue 31 jul · synced 2m ago</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <MessageSquare className="h-4 w-4" />
                  Ask
                </Button>
                <HeaderAuthControl />
              </div>
            </div>
            <p className="text-balance mt-7 max-w-[850px] text-[26px] font-semibold leading-[1.18] tracking-[-0.03em]">
              Two people are blocked behind you. Your first free block is at 14:00 — <span className="text-[var(--standup-accent-text)]">clear the queue before your 11:30 sync.</span>
            </p>
          </header>

          <div className="mt-8 grid gap-5 xl:grid-cols-[1fr_316px]">
            <div className="space-y-5">
              <FocusQueueCard />
              <WaitingCard />
            </div>
            <div className="space-y-5">
              <ShapeCard />
              <BottleneckCard />
              <GapCard missing={missing.map((source) => source.name)} connected={connected.map((source) => source.name)} />
            </div>
          </div>
        </SpringReveal>
      </div>
    </main>
  );
}

function FocusQueueCard() {
  return (
    <Card className="overflow-hidden border-[#212938]">
      <div className="flex items-center justify-between border-b border-[#212938] px-[18px] py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-[-0.01em]">Focus queue</h2>
          <span className="font-mono rounded bg-[var(--standup-accent-surface)] px-1.5 py-0.5 text-[11px] text-[var(--standup-accent-text)]">3 now</span>
        </div>
        <span className="text-xs text-[#6A7489]">ranked by who is waiting</span>
      </div>
      <AnimeStagger>
        {focusQueue.map((item) => (
          <div key={item.title} className="grid grid-cols-[1fr_auto] items-center gap-5 border-b border-[#212938] bg-[#121826] px-[18px] py-4 last:border-b-0 hover:bg-[#1A2130]">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`font-mono rounded px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.06em] ${item.tagClass}`}>{item.tag}</span>
                <span className="font-mono text-[11px] text-[#6A7489]">{item.src}</span>
                <span className="font-mono text-[11px] text-[#6A7489]">· {item.age}</span>
              </div>
              <h3 className="mb-1 text-[14.5px] font-medium tracking-[-0.012em]">{item.title}</h3>
              <p className="text-[13px] leading-[1.45] text-[#9AA4BA]">{item.reason}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm">{item.action}</Button>
              <Button variant="outline" size="sm">Snooze</Button>
            </div>
          </div>
        ))}
      </AnimeStagger>
      <div className="bg-[#0B0F1A] px-[18px] py-3 text-[12.5px] text-[#6A7489]">4 more events today — none of them block another person.</div>
    </Card>
  );
}

function WaitingCard() {
  return (
    <Card className="overflow-hidden border-[#212938]">
      <div className="flex items-center justify-between border-b border-[#212938] px-[18px] py-4">
        <h2 className="text-sm font-semibold">Waiting on others</h2>
        <span className="text-xs text-[#6A7489]">nothing for you to do — yet</span>
      </div>
      {waiting.map((item) => (
        <div key={item.title} className="grid grid-cols-[1fr_auto] gap-4 border-b border-[#212938] px-[18px] py-3 last:border-b-0">
          <div>
            <p className="text-[13.5px] font-medium">{item.title}</p>
            <p className="mt-0.5 text-[12.5px] text-[#6A7489]">{item.detail}</p>
          </div>
          <span className="font-mono text-[11.5px]" style={{ color: item.color }}>{item.age}</span>
        </div>
      ))}
    </Card>
  );
}

function ShapeCard() {
  return (
    <Card className="border-[#212938] p-[18px]">
      <h2 className="mb-3.5 text-sm font-semibold">Shape of your day</h2>
      <div className="space-y-3">
        {agenda.map((item) => (
          <div key={item.time} className="grid grid-cols-[42px_3px_1fr] gap-3">
            <span className="font-mono text-[11.5px] text-[#6A7489]">{item.time}</span>
            <span className="rounded-full" style={{ background: item.bar }} />
            <span>
              <span className="block text-[12.5px] font-medium">{item.title}</span>
              <span className="block text-[11.5px] text-[#6A7489]">{item.meta}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-[#212938] pt-3 text-[12.5px] leading-[1.45] text-[#9AA4BA]">2h 40m uninterrupted after 14:00. <span className="text-[#6A7489]">Best slot for DEV-21.</span></p>
    </Card>
  );
}

function BottleneckCard() {
  return (
    <Card className="border-[#212938] p-[18px]">
      <h2 className="text-sm font-semibold">You are the bottleneck on</h2>
      <p className="mt-1 text-[12.5px] leading-[1.45] text-[#6A7489]">Work that cannot move until you act.</p>
      <div className="mt-3 space-y-3">
        {blocking.map((item) => (
          <div key={item.title} className="border-l-2 border-[var(--standup-accent)] pl-3">
            <p className="text-[13px] font-medium">{item.title}</p>
            <p className="mt-0.5 text-xs leading-[1.45] text-[#9AA4BA]">{item.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function GapCard({ missing, connected }: { missing: string[]; connected: string[] }) {
  return (
    <Card className="border-dashed border-[#2A3345] bg-[#0B0F1A] p-[18px]">
      <p className="font-mono mb-2 text-[10.5px] uppercase tracking-[0.06em] text-[#6A7489]">Not connected</p>
      <h2 className="text-[13.5px] font-medium">{missing.join(" · ")}</h2>
      <p className="mt-1.5 text-[12.5px] leading-normal text-[#6A7489]">Today&apos;s ranking uses {connected.join(", ")}. Items above may reference work Standup cannot see yet.</p>
      <Button asChild variant="outline" size="sm" className="mt-3 border-[var(--standup-accent)] text-[var(--standup-accent-text)]">
        <Link href="/setup/connect">Connect {missing[0]}</Link>
      </Button>
    </Card>
  );
}
