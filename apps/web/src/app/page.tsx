import Link from "next/link";
import {
  ArrowRight,
  Blocks,
  BotMessageSquare,
  CalendarDays,
  CheckCircle2,
  GitPullRequest,
  LockKeyhole,
  MessageSquareText,
  Network,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const integrations = ["GitHub", "Slack", "Linear", "Jira", "Trello", "Notion", "Calendar"];

const focusItems = [
  ["Auth review is stale", "GitHub PR waiting 31h, Linear release issue linked", "high"],
  ["Checkout checks failed", "CI failed after payment callback changes", "high"],
  ["Release decision changed", "Slack and Notion mention scope shift", "medium"],
];

const useCases = [
  {
    icon: GitPullRequest,
    title: "Pull requests that need movement",
    body: "Surface stale reviews, failed checks, release blockers, and ownership context before they turn into project drag.",
  },
  {
    icon: MessageSquareText,
    title: "Decisions without thread archaeology",
    body: "Connect conversations, planning tickets, and docs into a durable event stream that explains why work changed.",
  },
  {
    icon: BotMessageSquare,
    title: "Workspace questions with source context",
    body: "Ask what changed, who worked on what, which PR blocks the release, or where the architecture decision came from.",
  },
];

const weeklySignals = [
  ["Merged PRs", "18"],
  ["Closed issues", "42"],
  ["Risks found", "5"],
  ["Active threads", "27"],
];

const faqs = [
  ["Does Developer OS replace GitHub or Linear?", "No. It connects engineering systems and turns their activity into WorkEvents."],
  ["Which integrations come first?", "GitHub, Slack, Linear, Jira, Trello, Notion, and Calendar are planned in the first multi-service connection layer."],
  ["Where do tokens live?", "Tokens and refresh tokens stay server-side behind the Go API Gateway and Supabase persistence layer."],
  ["Can teams start with only GitHub?", "Yes. The architecture supports one integration first and adds more context as services are connected."],
];

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fbfdff] text-brand-ink">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-primary text-white">
            <Workflow className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold">Developer OS</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-slate-600 md:flex">
          <a href="#integrations" className="transition-colors hover:text-brand-primary">Integrations</a>
          <a href="#focus" className="transition-colors hover:text-brand-primary">Focus</a>
          <a href="#security" className="transition-colors hover:text-brand-primary">Security</a>
        </nav>
        <Link href="/onboarding">
          <Button size="sm">Connect GitHub</Button>
        </Link>
      </header>

      <section className="relative border-y border-brand-border bg-[radial-gradient(circle_at_50%_0%,#DFF7FF_0%,#fbfdff_42%,#ffffff_100%)]">
        <div className="mx-auto grid min-h-[calc(100vh-80px)] max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_520px] lg:items-center lg:py-18">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-brand-border bg-white/80 px-3 py-1 text-sm font-medium text-brand-primary shadow-sm shadow-sky-100">
              <Sparkles className="h-4 w-4" />
              Engineering intelligence for the start of every day
            </div>
            <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight text-brand-ink sm:text-6xl lg:text-7xl">
              Understand what matters. Start building.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              Developer OS connects code, planning, conversations, docs, and meetings into one work event stream that tells engineers what needs attention now.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/onboarding">
                <Button>
                  Connect workspace
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="secondary">Open product</Button>
              </Link>
            </div>
            <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3 text-sm">
              {weeklySignals.slice(0, 3).map(([label, value]) => (
                <div key={label} className="border-l border-brand-border pl-4">
                  <p className="text-2xl font-semibold text-brand-ink">{value}</p>
                  <p className="mt-1 text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <HeroMockup />
        </div>
      </section>

      <section id="integrations" className="border-b border-brand-border bg-white px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-brand-primary">Connected context</p>
              <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Every service becomes WorkEvents.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              Developer OS does not replace your tools. It normalizes their activity so dashboard, focus, summaries, and chat speak the same language.
            </p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {integrations.map((integration) => (
              <div key={integration} className="rounded-md border border-brand-border bg-brand-muted px-4 py-5 text-center">
                <p className="text-sm font-semibold">{integration}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="focus" className="bg-[#f7fbff] px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[420px_1fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase text-brand-primary">Focus engine</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">One queue for what deserves attention first.</h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Failed checks, stale reviews, planning blockers, release risks, and recent decisions are ranked with the sources that explain them.
            </p>
          </div>
          <div className="grid gap-3">
            {focusItems.map(([title, reason, priority]) => (
              <div key={title} className="rounded-md border border-brand-border bg-white p-5 shadow-sm shadow-sky-100">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="text-base font-semibold">{title}</h3>
                  <span className="rounded-md bg-brand-surface px-2 py-1 text-xs font-semibold text-brand-primary">{priority}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{reason}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-brand-border bg-white px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-3">
          {useCases.map((item) => (
            <div key={item.title} className="rounded-md border border-brand-border bg-white p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-surface text-brand-primary">
                <item.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-brand-ink px-4 py-16 text-white sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_480px] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase text-brand-surface">Weekly intelligence</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              A clean summary of completed work, active work, risks, and blockers.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Weekly summaries are generated from normalized WorkEvents, so the report starts from persisted engineering data instead of scattered memory.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {weeklySignals.map(([label, value]) => (
              <div key={label} className="rounded-md border border-white/15 bg-white/10 p-5">
                <p className="text-3xl font-semibold">{value}</p>
                <p className="mt-2 text-sm text-slate-300">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="security" className="bg-white px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[420px_1fr]">
          <div>
            <p className="text-sm font-semibold uppercase text-brand-primary">Built for real work</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">A gateway-first architecture for sensitive integrations.</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              [LockKeyhole, "Tokens stay server-side"],
              [Network, "One API Gateway"],
              [ShieldCheck, "Provider-safe responses"],
            ].map(([Icon, label]) => (
              <div key={label as string} className="rounded-md border border-brand-border bg-brand-muted p-5">
                <Icon className="h-5 w-5 text-brand-primary" />
                <p className="mt-4 text-sm font-semibold">{label as string}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-brand-border bg-[#f7fbff] px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-semibold uppercase text-brand-primary">FAQ</p>
          <div className="mt-6 divide-y divide-brand-border rounded-md border border-brand-border bg-white">
            {faqs.map(([question, answer]) => (
              <div key={question} className="p-5">
                <h3 className="text-sm font-semibold">{question}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">Open Developer OS. Know what matters.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-600">
            Start with GitHub, then connect the rest of the services that define your engineering day.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/onboarding">
              <Button>
                Start connecting
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function HeroMockup() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-[28px] bg-brand-surface blur-2xl" />
      <div className="relative rounded-xl border border-brand-border bg-white p-4 shadow-2xl shadow-sky-100">
        <div className="flex items-center justify-between border-b border-brand-border pb-4">
          <div>
            <p className="text-sm font-semibold">Today</p>
            <p className="text-xs text-slate-500">Workspace intelligence</p>
          </div>
          <span className="rounded-md bg-brand-surface px-2 py-1 text-xs font-semibold text-brand-primary">Live</span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ["Review", "7"],
            ["Blockers", "3"],
            ["Risks", "2"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-brand-border bg-brand-muted p-3">
              <p className="text-2xl font-semibold">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-md border border-brand-border p-4">
          <div className="flex items-center gap-2">
            <Blocks className="h-4 w-4 text-brand-primary" />
            <p className="text-sm font-semibold">Focus recommendation</p>
          </div>
          <h3 className="mt-3 text-xl font-semibold tracking-tight">Authentication PR blocks mobile release</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            GitHub has a stale review, Linear marks the release issue at risk, and Slack confirms the dependency.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          {[
            [GitPullRequest, "Review requested", "GitHub · dev-os-api"],
            [MessageSquareText, "Decision captured", "Slack · #release"],
            [CalendarDays, "Follow-up created", "Calendar · planning sync"],
            [CheckCircle2, "Issue completed", "Linear · Sprint 1"],
          ].map(([Icon, title, source]) => (
            <div key={title as string} className="flex items-center justify-between rounded-md border border-brand-border px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-brand-primary" />
                <span className="truncate text-sm font-medium">{title as string}</span>
              </span>
              <span className="hidden text-xs text-slate-500 sm:block">{source as string}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
