import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnimeStagger } from "@/components/motion/anime-stagger";
import { SpringReveal } from "@/components/motion/react-spring-reveal";
import { BrandMark } from "@/components/brand/brand-mark";
import { OrbitSection } from "@/components/marketing/orbit-section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LandingAuthControl } from "@/components/auth/landing-auth-control";
import { heroQueue, setupBeats, sources } from "@/features/wave-one/design-data";

const excluded = [
  ["Velocity and story-point charts", "They measure estimation habits, not progress."],
  ["Developer leaderboards", "Ranking people breaks the trust the product depends on."],
  ["A notification firehose", "You already have six of those. This one has to be shorter."],
  ["Dashboards nobody acts on", "If a number does not change a decision, it is decoration."],
];

const tools = [
  ["gh", "GitHub", "Live"],
  ["li", "Linear", "Next"],
  ["sl", "Slack", "Next"],
  ["ji", "Jira", "Queued"],
  ["ca", "Calendar", "Queued"],
  ["no", "Notion", "Queued"],
  ["tr", "Trello", "Queued"],
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#080C15] text-[#E9EDF7]">
      <header className="flex h-16 items-center justify-between border-b border-[#212938] px-5 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark />
          <span className="text-sm font-semibold tracking-[-0.01em]">Standup</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/today" className="hidden px-3 py-2 text-[13px] text-[#9AA4BA] hover:text-[var(--standup-accent-text)] sm:inline-flex">
            Changelog
          </Link>
          <Link href="/setup" className="hidden px-3 py-2 text-[13px] text-[#9AA4BA] hover:text-[var(--standup-accent-text)] sm:inline-flex">
            Docs
          </Link>
          <LandingAuthControl />
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-[1440px] gap-12 px-5 py-[72px] sm:px-10 lg:grid-cols-[minmax(480px,1fr)_minmax(520px,720px)] lg:items-center lg:gap-[72px]">
        <SpringReveal>
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[var(--standup-accent-border)] bg-[var(--standup-accent-surface)] py-1.5 pl-2 pr-3">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--standup-accent)] animate-dos-pulse" />
            <span className="text-xs font-medium text-[var(--standup-accent-text)]">Seven tools in, one morning out</span>
          </div>
          <h1 className="text-balance text-[44px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[54px]">
            Open Standup.
            <br />
            Understand what matters.
            <br />
            <span className="text-[#6A7489]">Start building.</span>
          </h1>
          <p className="text-pretty mt-5 max-w-[470px] text-[17px] leading-[1.55] text-[#9AA4BA]">
            Your pull requests, issues, threads and meetings arrive from seven tools in seven shapes. Standup normalizes them into one stream of work events, then tells you which three deserve the next hour.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/login">
                Show me what needs me today
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/today">Walk through a real morning</Link>
            </Button>
          </div>
          <p className="mt-3 text-[12.5px] text-[#6A7489]">Under two minutes to your first ranked morning. Read-only, no setup meeting.</p>
          <div className="mt-8 flex flex-wrap items-center gap-[18px]">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[#6A7489]">Normalizes</span>
            {sources.map((source, index) => (
              <span key={source.id} className="flex items-center gap-1.5 text-[12.5px] text-[#9AA4BA]">
                <span className="h-[5px] w-[5px] rounded-full" style={{ background: index === 0 ? "var(--standup-accent)" : "#2A3345" }} />
                {source.name}
              </span>
            ))}
          </div>
        </SpringReveal>

        <SpringReveal delay={80}>
          <Card className="overflow-hidden rounded-[14px] border-[#212938]">
            <div className="flex h-[38px] items-center gap-2 border-b border-[#212938] bg-[#0B0F1A] px-3.5">
              <span className="h-[9px] w-[9px] rounded-full bg-[#212938]" />
              <span className="h-[9px] w-[9px] rounded-full bg-[#212938]" />
              <span className="h-[9px] w-[9px] rounded-full bg-[#212938]" />
              <span className="font-mono ml-2.5 text-[11px] text-[#6A7489]">today · tuesday</span>
            </div>
            <div className="p-6">
              <p className="text-pretty mb-5 text-[15px] leading-normal">
                Two things are blocking other people. <span className="text-[#6A7489]">Everything else can wait until after your 14:00.</span>
              </p>
              <AnimeStagger className="space-y-2">
                {heroQueue.map((item) => (
                  <div key={item.n} className="grid grid-cols-[22px_1fr_auto] gap-3 rounded-[10px] border border-[#212938] bg-[#121826] px-3.5 py-3 transition-colors hover:border-[var(--standup-accent-border)] hover:bg-[#1A2130]">
                    <span className="font-mono pt-0.5 text-[11px] text-[#6A7489]">{item.n}</span>
                    <div>
                      <div className="mb-1 text-[13.5px] font-medium tracking-[-0.01em]">{item.title}</div>
                      <div className="text-[12.5px] leading-[1.45] text-[#9AA4BA]">{item.reason}</div>
                    </div>
                    <span className="font-mono pt-1 text-[10.5px] text-[#6A7489]">{item.src}</span>
                  </div>
                ))}
              </AnimeStagger>
            </div>
          </Card>
          <p className="mt-3.5 text-xs text-[#6A7489]">Not a dashboard. A decision about the next hour.</p>
        </SpringReveal>
      </section>

      <OrbitSection />
      <PrimitiveSection />
      <AnswersSection />
      <SetupSection />
      <RestraintSection />
      <SourcesSection />

      <section className="border-t border-[#212938] bg-[#121826] px-5 py-[108px] text-center sm:px-10">
        <div className="mx-auto max-w-[780px]">
          <h2 className="text-balance text-[40px] font-semibold leading-[1.1] tracking-[-0.034em]">Tomorrow morning, open one thing.</h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-[#9AA4BA]">Understand what matters. Then start building.</p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/login">Start setup</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/today">Preview today</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="flex flex-col gap-4 border-t border-[#212938] px-5 py-7 text-xs text-[#9AA4BA] sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <span className="flex items-center gap-2">
          <BrandMark />
          Standup · the developer OS · read-only by design
        </span>
        <span className="flex gap-5">Security · Docs · Changelog</span>
      </footer>
    </main>
  );
}

function PrimitiveSection() {
  return (
    <section className="border-t border-[#212938] bg-[#0B0F1A] px-5 py-[108px] sm:px-10">
      <div className="mx-auto grid max-w-[1180px] gap-[72px] lg:grid-cols-[minmax(360px,1fr)_minmax(420px,560px)] lg:items-center">
        <div>
          <p className="font-mono mb-5 text-[11px] uppercase tracking-[0.08em] text-[#6A7489]">01 · the primitive</p>
          <h2 className="text-balance text-[38px] font-semibold leading-[1.12] tracking-[-0.032em]">Seven APIs. Seven vocabularies. One event.</h2>
          <p className="text-pretty mt-5 max-w-[480px] text-base leading-[1.6] text-[#9AA4BA]">A review request, a blocked issue, an unanswered thread and a meeting that eats your afternoon are the same kind of thing: something happened, and it may need you.</p>
          <p className="text-pretty mt-4 max-w-[480px] text-base leading-[1.6] text-[#9AA4BA]">Standup normalizes every source into a single <span className="font-mono text-[14.5px] text-[#E9EDF7]">WorkEvent</span> before any feature touches it.</p>
          <AnimeStagger className="mt-8 grid max-w-[480px] grid-cols-3 gap-3.5">
            {[["1,284", "events in a typical week"], ["41", "actually involve you"], ["3", "need you this morning"]].map(([n, label], index) => (
              <div key={label} className="border-l-2 pl-3" style={{ borderColor: index === 0 ? "var(--standup-accent)" : "var(--standup-accent-surface)" }}>
                <div className="font-mono text-2xl tracking-[-0.02em]">{n}</div>
                <div className="mt-1 text-[12.5px] text-[#6A7489]">{label}</div>
              </div>
            ))}
          </AnimeStagger>
        </div>
        <Card className="overflow-hidden rounded-[13px] border-[#212938]">
          <div className="flex h-9 items-center border-b border-[#212938] bg-[#0B0F1A] px-3.5">
            <span className="font-mono text-[11px] text-[#6A7489]">work-event.ts</span>
          </div>
          <pre className="font-mono overflow-x-auto p-5 text-[12.5px] leading-[1.75] text-[#E9EDF7]"><span className="text-[#6A7489]">type</span> <span className="text-[var(--standup-accent-text)]">WorkEvent</span> = {`{
  service: "github" | "slack" | "linear" | ...
  type: "pull_request.review_requested"
  title: "Review requested · Auth OAuth flow"
  actor: "Guilherme"
  source: "guibersi7/dev-os-orchestrator"
  priority: "high"
  metadata: { prNumber: 42, blocks: ["DEV-18"] }
}`}</pre>
        </Card>
      </div>
    </section>
  );
}

function AnswersSection() {
  return (
    <section className="border-t border-[#212938] bg-[#121826] px-5 py-[108px] sm:px-10">
      <div className="mx-auto max-w-[1180px]">
        <p className="font-mono mb-5 text-[11px] uppercase tracking-[0.08em] text-[#6A7489]">02 · the first ninety seconds</p>
        <h2 className="text-balance max-w-[720px] text-[38px] font-semibold leading-[1.12] tracking-[-0.032em]">Three answers, before your first coffee cools.</h2>
        <p className="text-pretty mt-4 max-w-[620px] text-base leading-[1.6] text-[#9AA4BA]">Every surface exists to answer one question. If a card cannot say why it is on your screen, it is not on your screen.</p>
        <AnimeStagger className="mt-11 grid gap-5 lg:grid-cols-3">
          <ValueCard title="Ranked, with a reason" body="Never a wall of notifications. Three items, each carrying the sentence that justifies its position.">
            <MiniQueue />
          </ValueCard>
          <ValueCard title="Blocked chains, end to end" body="The link between a stalled review and a slipping release lives across three tools. We draw it in one.">
            <BlockedChain />
          </ValueCard>
          <ValueCard title="Ask, in plain language" body="Answers cite the events they came from. No summary you have to take on faith.">
            <MiniChat />
          </ValueCard>
        </AnimeStagger>
      </div>
    </section>
  );
}

function ValueCard({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col overflow-hidden rounded-[13px] border-[#212938] transition-colors hover:border-[var(--standup-accent)]">
      <div className="p-5 pb-4">
        <h3 className="text-base font-semibold tracking-[-0.015em]">{title}</h3>
        <p className="mt-1.5 text-[13.5px] leading-normal text-[#9AA4BA]">{body}</p>
      </div>
      <div className="mt-auto border-t border-[#212938] bg-[#0B0F1A] p-4">{children}</div>
    </Card>
  );
}

function MiniQueue() {
  return (
    <div className="space-y-2">
      {["Review · Auth OAuth flow #42", "Checks failing · retry-backoff #118"].map((title, index) => (
        <div key={title} className="rounded-[9px] border border-[#212938] bg-[#121826] p-3">
          <div className="mb-1 text-[12.5px] font-medium">{title}</div>
          <div className="text-[11.5px] leading-[1.4] text-[#9AA4BA]">{index === 0 ? "Ana has waited 2 days. DEV-18 sits behind it." : "Your branch. Nobody else is touching it."}</div>
        </div>
      ))}
    </div>
  );
}

function BlockedChain() {
  const items = [["var(--standup-accent)", "PR #42 · waiting on your review"], ["var(--standup-accent-text)", "DEV-18 · blocked 2 days"], ["#2A3345", "Mobile release · Friday"]];
  return (
    <div>
      {items.map(([color, label], index) => (
        <div key={label}>
          <div className="grid grid-cols-[8px_1fr] items-center gap-3">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            <span className="text-[12.5px] font-medium">{label}</span>
          </div>
          {index < items.length - 1 ? <div className="ml-[3.5px] h-4 w-px bg-[var(--standup-accent)]" /> : null}
        </div>
      ))}
    </div>
  );
}

function MiniChat() {
  return (
    <div className="space-y-2.5">
      <div className="ml-auto max-w-[88%] rounded-[10px_10px_3px_10px] bg-primary px-3 py-2 text-[12.5px] text-[#E9EDF7]">What slipped this week and why?</div>
      <div className="max-w-[94%] rounded-[10px_10px_10px_3px] border border-[#212938] bg-[#121826] px-3 py-2.5 text-[12.5px] leading-normal">Two items. Both trace back to review latency on the connectors repo.
        <div className="mt-2 flex gap-1.5">
          <span className="font-mono rounded bg-[var(--standup-accent-surface)] px-1.5 py-0.5 text-[10px] text-[var(--standup-accent-text)]">14 events</span>
          <span className="font-mono rounded bg-[#1A2130] px-1.5 py-0.5 text-[10px] text-[#9AA4BA]">DEV-18</span>
        </div>
      </div>
    </div>
  );
}

function SetupSection() {
  return (
    <section className="border-t border-[#212938] bg-[#0B0F1A] px-5 py-[108px] sm:px-10">
      <div className="mx-auto max-w-[1180px]">
        <p className="font-mono mb-5 text-[11px] uppercase tracking-[0.08em] text-[#6A7489]">03 · setup</p>
        <h2 className="text-balance max-w-[720px] text-[38px] font-semibold leading-[1.12] tracking-[-0.032em]">Two minutes from authorize to answer.</h2>
        <AnimeStagger className="mt-11 grid overflow-hidden rounded-[13px] border border-[#212938] bg-[#212938] md:grid-cols-4">
          {setupBeats.map((beat) => (
            <div key={beat.n} className="bg-[#121826] p-5">
              <span className="font-mono rounded-full bg-[var(--standup-accent-surface)] px-2 py-1 text-[11px] text-[var(--standup-accent-text)]">{beat.time}</span>
              <h3 className="mt-4 text-base font-semibold">{beat.title}</h3>
              <p className="mt-2 text-[13px] leading-normal text-[#9AA4BA]">{beat.desc}</p>
            </div>
          ))}
        </AnimeStagger>
      </div>
    </section>
  );
}

function RestraintSection() {
  return (
    <section className="border-t border-[#212938] bg-[#121826] px-5 py-[108px] sm:px-10">
      <div className="mx-auto max-w-[1180px]">
        <h2 className="text-balance max-w-[760px] text-[38px] font-semibold leading-[1.12] tracking-[-0.032em]">What Standup will never put on your screen.</h2>
        <AnimeStagger className="mt-10 grid gap-3 md:grid-cols-2">
          {excluded.map(([title, why]) => (
            <Card key={title} className="border-[#212938] p-5">
              <p className="text-base font-semibold line-through decoration-[#FF6B8A] decoration-2">{title}</p>
              <p className="mt-2 text-[13.5px] text-[#9AA4BA]">{why}</p>
            </Card>
          ))}
        </AnimeStagger>
      </div>
    </section>
  );
}

function SourcesSection() {
  return (
    <section className="border-t border-[#212938] bg-[#0B0F1A] px-5 py-[108px] sm:px-10">
      <div className="mx-auto max-w-[1180px]">
        <h2 className="text-balance text-[38px] font-semibold leading-[1.12] tracking-[-0.032em]">Sources from day zero.</h2>
        <AnimeStagger className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {tools.map(([tag, name, state]) => {
            const live = state === "Live";
            return (
              <Card key={tag} className={`p-4 ${live ? "border-[var(--standup-accent)] bg-[#1A2130]" : "border-[#212938]"}`}>
                <span className="font-mono flex h-8 w-8 items-center justify-center rounded-md bg-[#1A2130] text-[11px] text-[#9AA4BA]">{tag}</span>
                <p className="mt-4 text-sm font-semibold">{name}</p>
                <p className={`font-mono mt-1 text-[11px] ${live ? "text-[var(--standup-accent-text)]" : "text-[#6A7489]"}`}>{state}</p>
              </Card>
            );
          })}
        </AnimeStagger>
      </div>
    </section>
  );
}
