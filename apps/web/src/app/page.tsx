"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Search } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { OrbitSection } from "@/components/marketing/orbit-section";
import { Button } from "@/components/ui/button";
import { BrandIcon } from "@/features/integrations/icons";
import { heroQueue, setupBeats, sources } from "@/features/wave-one/design-data";
import type { Service } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const tickerEvents = [
  "pull_request.review_requested",
  "issue.blocked",
  "thread.mention",
  "calendar.focus_window",
  "checks.failed",
  "doc.updated",
  "card.moved",
  "decision.requested",
];

const funnel = [
  { value: 1284, label: "work events in a typical week", note: "Every review, issue, thread, doc and meeting normalized first." },
  { value: 41, label: "actually involve you", note: "The rest remains searchable context, not your morning queue." },
  { value: 3, label: "need you this morning", note: "The product earns trust by making the list smaller.", accent: true },
];

const moments = [
  {
    eyebrow: "01 · rank",
    title: "Start with the three things that need you.",
    body: "Standup reads across tools, then explains why each item outranks the rest of the stream.",
    ui: <RankMoment />,
  },
  {
    eyebrow: "02 · unblock",
    title: "See the chain behind the interruption.",
    body: "A stalled PR, a Linear blocker and a Slack decision become one path instead of three tabs.",
    ui: <BlockerMoment />,
  },
  {
    eyebrow: "03 · ask",
    title: "Ask what changed and get cited answers.",
    body: "The answer points back to the WorkEvents it used, so summaries stay accountable.",
    ui: <AskMoment />,
  },
];

const cutItems = [
  ["Velocity and story-point charts", "They measure estimation habits, not progress."],
  ["Developer leaderboards", "Ranking people breaks the trust the product depends on."],
  ["A notification firehose", "You already have six of those. This one has to be shorter."],
  ["Dashboards nobody acts on", "If a number does not change a decision, it is decoration."],
];

const sourceStatus: Array<{ service: Service; status: string; live?: boolean }> = [
  { service: "github", status: "live", live: true },
  { service: "slack", status: "queued" },
  { service: "linear", status: "queued" },
  { service: "jira", status: "queued" },
  { service: "trello", status: "queued" },
  { service: "notion", status: "queued" },
  { service: "calendar", status: "queued" },
];

export default function LandingPage() {
  const rootRef = useRef<HTMLElement>(null);
  const mountedRef = useRef(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const [momentIndex, setMomentIndex] = useState(0);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (mountedRef.current || !rootRef.current) {
      return;
    }
    mountedRef.current = true;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      return;
    }

    let cleanup = () => {};
    let tickerTimer: number | undefined;

    async function mountMotion() {
      const [{ default: gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
        import("lenis"),
      ]);

      gsap.registerPlugin(ScrollTrigger);
      const lenis = new Lenis({ lerp: 0.08, smoothWheel: true });
      const raf = (time: number) => {
        lenis.raf(time);
        requestAnimationFrame(raf);
      };
      const rafId = requestAnimationFrame(raf);

      const ctx = gsap.context(() => {
        gsap.set("[data-hero-line] > span", { yPercent: 108 });
        gsap.to("[data-hero-line] > span", { yPercent: 0, duration: 1.05, ease: "expo.out", stagger: 0.07 });
        gsap.set("[data-hero]", { opacity: 0, y: 14 });
        gsap.to("[data-hero]", { opacity: 1, y: 0, duration: 0.85, ease: "power3.out", stagger: 0.07, delay: 0.18 });

        gsap.utils.toArray<HTMLElement>("[data-rise]").forEach((el) => {
          gsap.from(el, {
            opacity: 0,
            y: 18,
            duration: 0.85,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 88%", once: true },
          });
        });

        gsap.utils.toArray<HTMLElement>("[data-count]").forEach((el) => {
          const target = Number(el.dataset.count ?? 0);
          const state = { value: 0 };
          gsap.to(state, {
            value: target,
            duration: 1.6,
            ease: "power2.out",
            onUpdate: () => {
              el.textContent = Math.round(state.value).toLocaleString("pt-BR");
            },
            scrollTrigger: { trigger: el, start: "top 90%", once: true },
          });
        });

        const ticker = document.querySelector<HTMLElement>("[data-ticker-track]");
        if (ticker) {
          const tween = gsap.to(ticker, {
            xPercent: -50,
            duration: 28,
            ease: "none",
            repeat: -1,
            modifiers: { xPercent: gsap.utils.wrap(-50, 0) },
          });
          ScrollTrigger.create({
            start: 0,
            end: "max",
            onUpdate: (self) => {
              const scale = Math.min(6, 1 + Math.abs(self.getVelocity()) / 900);
              tween.timeScale(scale);
              if (tickerTimer) window.clearTimeout(tickerTimer);
              tickerTimer = window.setTimeout(() => tween.timeScale(1), 120);
            },
          });
        }

        ScrollTrigger.matchMedia({
          "(min-width: 900px)": () => {
            ScrollTrigger.create({
              trigger: "[data-pin-wrap]",
              start: "top top",
              end: "+=220%",
              pin: "[data-pin-panel]",
              pinSpacing: true,
              onUpdate: (self) => setMomentIndex(Math.min(2, Math.floor(self.progress * 3))),
            });
          },
        });

        gsap.to("[data-setup-progress]", {
          scaleX: 1,
          ease: "none",
          scrollTrigger: { trigger: "[data-setup]", start: "top 70%", end: "bottom 70%", scrub: 0.6 },
        });

        gsap.utils.toArray<HTMLElement>("[data-cut-rule]").forEach((el) => {
          gsap.to(el, {
            width: "100%",
            duration: 0.55,
            ease: "power2.inOut",
            scrollTrigger: { trigger: el.parentElement, start: "top 86%", once: true },
          });
        });
      }, rootRef);

      cleanup = () => {
        ctx.revert();
        ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
        lenis.destroy();
        cancelAnimationFrame(rafId);
        if (tickerTimer) window.clearTimeout(tickerTimer);
      };
    }

    mountMotion().catch(() => {
      cleanup = () => {};
    });

    return () => cleanup();
  }, []);

  return (
    <main ref={rootRef} className="min-h-screen bg-bg-base text-[#E9EDF7]">
      <div aria-hidden="true" className="standup-grain fixed inset-0 z-[200]" />
      <header className={cn("fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-transparent px-[clamp(20px,4vw,56px)] transition-all duration-300", navScrolled && "border-[#141A28] bg-[rgba(8,12,21,.72)] backdrop-blur-md")}>
        <Link href="/" className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(29,156,76,.32)]">
          <BrandMark size={22} />
          <span className="text-sm font-semibold tracking-[-0.01em]">Standup</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/today" className="hidden px-3 py-2 text-[13px] text-[#9AA4BA] transition-colors hover:text-standup-accent-text sm:inline-flex">Changelog</Link>
          <Link href="/setup" className="hidden px-3 py-2 text-[13px] text-[#9AA4BA] transition-colors hover:text-standup-accent-text sm:inline-flex">Docs</Link>
          <Button asChild variant="outline" size="sm" className="border-line-strong bg-surface hover:border-line-strongest">
            <Link href="/login">Sign in</Link>
          </Button>
        </nav>
      </header>

      <section className="relative grid min-h-screen overflow-hidden px-[clamp(20px,4vw,56px)] pt-28 lg:grid-cols-[minmax(420px,1fr)_minmax(380px,520px)] lg:items-center lg:gap-16">
        <div aria-hidden="true" className="absolute right-[8%] top-[10%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(29,156,76,.22),transparent_66%)]" />
        <div className="relative z-10 max-w-[650px] pb-12">
          <div data-hero className="mb-7 inline-flex items-center gap-2 rounded-full border border-standup-accent-border bg-standup-accent-surface py-1.5 pl-2 pr-3">
            <span className="h-1.5 w-1.5 animate-dos-pulse rounded-full bg-standup-accent" />
            <span className="text-xs font-medium text-standup-accent-text">Seven tools in, one morning out</span>
          </div>
          <h1 className="text-balance text-[clamp(46px,6.4vw,92px)] font-semibold leading-[.96] tracking-[-0.045em]">
            <span data-hero-line className="hero-line"><span>Open Standup.</span></span>
            <span data-hero-line className="hero-line"><span>Understand what matters.</span></span>
            <span data-hero-line className="hero-line text-[#545F79]"><span>Start building.</span></span>
          </h1>
          <p data-hero className="text-pretty mt-6 max-w-[540px] text-[clamp(15px,1.4vw,19px)] leading-[1.55] text-[#9AA4BA]">
            Your pull requests, issues, threads and meetings arrive from seven tools in seven shapes. Standup normalizes them into one stream of work events, then tells you which three deserve the next hour.
          </p>
          <div data-hero className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-[9px] bg-standup-accent transition-transform duration-200 hover:-translate-y-px hover:bg-standup-accent-hover">
              <Link href="/login">Mostre o que precisa de mim hoje <ArrowRight className="size-4" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-[9px] border-line-strong bg-surface hover:border-line-strongest">
              <Link href="/today">Walk through a real morning</Link>
            </Button>
          </div>
          <p data-hero className="font-mono mt-4 text-[12px] text-[#79839B]">under 2m · read-only scopes · no setup meeting</p>
        </div>

        <div data-hero className="relative z-10 -mr-[clamp(20px,4vw,56px)] hidden lg:block">
          <ProductPanel className="w-[860px] rounded-l-2xl rounded-r-none border-r-0" />
          <p className="font-mono ml-1 mt-3 text-[11px] text-[#79839B]">not a dashboard · a decision about the next hour</p>
        </div>
      </section>

      <Ticker />
      <FunnelSection />
      <OrbitSection />
      <PinnedMoments active={momentIndex} />
      <SetupSection />
      <CutsSection />
      <SourcesSection />
      <CloseSection />
    </main>
  );
}

function Ticker() {
  const items = [...tickerEvents, ...tickerEvents];
  return (
    <section aria-hidden="true" className="ticker-mask overflow-hidden border-y border-line-softer bg-bg-alt py-4">
      <div data-ticker-track className="flex w-max gap-8 will-change-transform">
        {items.map((event, index) => (
          <span key={`${event}-${index}`} className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#79839B]">{event}</span>
        ))}
      </div>
    </section>
  );
}

function ProductPanel({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden border border-line bg-surface shadow-[0_28px_80px_-36px_rgba(0,0,0,.78)]", className)}>
      <div className="flex h-10 items-center gap-2 border-b border-line-hair bg-bg-alt px-4">
        <span className="h-[9px] w-[9px] rounded-full bg-line" />
        <span className="h-[9px] w-[9px] rounded-full bg-line" />
        <span className="h-[9px] w-[9px] rounded-full bg-line" />
        <span className="font-mono ml-3 text-[11px] text-[#79839B]">today · tuesday</span>
      </div>
      <div className="grid grid-cols-[1fr_260px] gap-0">
        <div className="p-6">
          <p className="text-pretty mb-5 text-[15px] leading-[1.5] text-[#E9EDF7]">Two things are blocking other people. <span className="text-[#79839B]">Everything else can wait until after your 14:00.</span></p>
          <div className="space-y-2">
            {heroQueue.map((item, index) => (
              <div key={item.n} className="grid grid-cols-[28px_1fr_auto] gap-3 rounded-[10px] border border-line-softer bg-surface px-3.5 py-3 transition-colors hover:border-standup-accent-border hover:bg-surface-2">
                <span className="font-mono pt-0.5 text-[11px] text-[#79839B]">{item.n}</span>
                <div>
                  <div className="mb-1 text-[13.5px] font-medium tracking-[-0.01em]">{item.title}</div>
                  <div className="text-[12.5px] leading-[1.45] text-[#8C96AD]">{item.reason}</div>
                </div>
                <span className={cn("mt-1 h-8 w-1 rounded-full", index === 1 ? "bg-danger-600" : "bg-standup-accent")} />
              </div>
            ))}
          </div>
        </div>
        <div className="border-l border-line-hair bg-bg-alt p-5">
          <div className="font-mono mb-4 text-[11px] uppercase tracking-[0.08em] text-[#79839B]">why now</div>
          <div className="space-y-3">
            {["2d waiting", "DEV-18 blocked", "14:00 focus window"].map((label) => (
              <div key={label} className="flex items-center gap-2 text-[13px] text-[#9AA4BA]">
                <Check className="size-3.5 text-standup-accent-text" />
                {label}
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-[10px] border border-info-border bg-info-surface p-4">
            <p className="text-[13px] font-medium">Blocked chain</p>
            <p className="mt-1 text-[12px] leading-[1.45] text-[#8C96AD]">PR #42 {"->"} DEV-18 {"->"} mobile release</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FunnelSection() {
  return (
    <section className="bg-bg-base px-[clamp(20px,4vw,56px)] py-[clamp(80px,10vw,130px)]">
      <div className="mx-auto max-w-[1180px]">
        <p data-rise className="font-mono mb-6 text-[11px] uppercase tracking-[0.08em] text-[#79839B]">one stream, smaller every step</p>
        <div className="space-y-[clamp(26px,4vw,44px)]">
          {funnel.map((item, index) => (
            <div key={item.value} data-rise className="grid items-end gap-5 md:grid-cols-[auto_1fr]" style={{ marginLeft: `clamp(0px, ${index * 8}vw, ${index * 145}px)` }}>
              <div data-count={item.value} className={cn("font-mono text-[clamp(64px,10vw,148px)] leading-[.85] tracking-[-0.05em]", item.accent ? "text-standup-accent-text" : "text-[#E9EDF7]")}>0</div>
              <div className="max-w-[460px] pb-2">
                <h2 className="text-[clamp(24px,3vw,38px)] font-semibold leading-[1.08] tracking-[-0.034em]">{item.label}</h2>
                <p className="text-pretty mt-2 text-[15px] leading-[1.55] text-[#9AA4BA]">{item.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PinnedMoments({ active }: { active: number }) {
  const current = moments[active] ?? moments[0];
  return (
    <section data-pin-wrap className="bg-surface px-[clamp(20px,4vw,56px)] py-[clamp(80px,10vw,130px)] lg:min-h-[220vh]">
      <div data-pin-panel className="mx-auto grid max-w-[1180px] gap-10 lg:min-h-screen lg:grid-cols-[minmax(320px,440px)_1fr] lg:items-center">
        <div>
          <p className="font-mono mb-5 text-[11px] uppercase tracking-[0.08em] text-[#79839B]">{current.eyebrow}</p>
          <h2 className="text-balance text-[clamp(28px,3.4vw,44px)] font-semibold leading-[1.1] tracking-[-0.034em]">{current.title}</h2>
          <p className="text-pretty mt-5 text-[clamp(15px,1.4vw,19px)] leading-[1.55] text-[#9AA4BA]">{current.body}</p>
          <div className="mt-8 hidden gap-2 lg:flex">
            {moments.map((moment, index) => <span key={moment.eyebrow} className={cn("h-0.5 w-14 rounded-full", active === index ? "bg-standup-accent" : "bg-line-strong")} />)}
          </div>
        </div>
        <div className="hidden lg:block">{current.ui}</div>
        <div className="space-y-6 lg:hidden">
          {moments.map((moment) => (
            <div key={moment.eyebrow}>
              <p className="font-mono mb-3 text-[11px] uppercase tracking-[0.08em] text-[#79839B]">{moment.eyebrow}</p>
              <h3 className="text-[24px] font-semibold tracking-[-0.03em]">{moment.title}</h3>
              <p className="mt-2 text-[15px] leading-[1.55] text-[#9AA4BA]">{moment.body}</p>
              <div className="mt-4">{moment.ui}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RankMoment() {
  return <ProductPanel className="rounded-2xl" />;
}

function BlockerMoment() {
  return (
    <div className="rounded-2xl border border-info-border bg-info-surface p-6">
      {["Review requested · Auth OAuth flow #42", "DEV-18 mobile release is blocked", "Friday release window at risk"].map((label, index) => (
        <div key={label}>
          <div className="grid grid-cols-[12px_1fr_auto] items-center gap-3">
            <span className={cn("h-3 w-3 rounded-full", index === 0 ? "bg-standup-accent" : index === 1 ? "bg-danger-600" : "bg-warn-text")} />
            <span className="text-[15px] font-medium">{label}</span>
            <span className="font-mono text-[11px] text-[#79839B]">{index === 0 ? "github" : index === 1 ? "linear" : "calendar"}</span>
          </div>
          {index < 2 ? <div className="ml-[5.5px] h-12 w-px bg-line-strong" /> : null}
        </div>
      ))}
    </div>
  );
}

function AskMoment() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center gap-2 rounded-[10px] border border-line-softer bg-bg-alt px-3 py-2">
        <Search className="size-4 text-[#79839B]" />
        <span className="text-[14px] text-[#E9EDF7]">What slipped this week and why?</span>
      </div>
      <div className="mt-4 rounded-[12px] border border-line-softer bg-bg-alt p-4 text-[14px] leading-[1.55]">
        Two items. Both trace back to review latency on the connectors repo.
        <div className="mt-3 flex flex-wrap gap-2">
          {["14 events", "PR #42", "DEV-18"].map((tag) => <span key={tag} className="font-mono rounded-md border border-standup-accent-border bg-standup-accent-surface px-2 py-1 text-[10.5px] text-standup-accent-text">{tag}</span>)}
        </div>
      </div>
    </div>
  );
}

function SetupSection() {
  return (
    <section data-setup className="bg-bg-alt px-[clamp(20px,4vw,56px)] py-[clamp(80px,10vw,130px)]">
      <div className="mx-auto max-w-[1180px]">
        <p data-rise className="font-mono mb-5 text-[11px] uppercase tracking-[0.08em] text-[#79839B]">setup in four beats</p>
        <h2 data-rise className="text-balance max-w-[760px] text-[clamp(28px,3.4vw,44px)] font-semibold leading-[1.1] tracking-[-0.034em]">Two minutes from authorize to answer.</h2>
        <div data-rise className="relative mt-14">
          <div className="absolute left-0 right-0 top-[17px] h-px bg-line" />
          <div data-setup-progress className="setup-progress absolute left-0 right-0 top-[17px] h-px bg-standup-accent" />
          <div className="grid gap-6 md:grid-cols-4">
            {setupBeats.map((beat) => (
              <div key={beat.n} className="relative pt-11">
                <span className="absolute left-0 top-0 flex h-[34px] w-[34px] items-center justify-center rounded-full border border-standup-accent-border bg-standup-accent-surface font-mono text-[11px] text-standup-accent-text">{beat.n}</span>
                <span className="font-mono text-[11px] text-[#79839B]">{beat.time}</span>
                <h3 className="mt-3 text-[17px] font-semibold">{beat.title}</h3>
                <p className="mt-2 text-[13.5px] leading-[1.55] text-[#9AA4BA]">{beat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CutsSection() {
  return (
    <section className="bg-surface px-[clamp(20px,4vw,56px)] py-[clamp(80px,10vw,130px)]">
      <div className="mx-auto max-w-[980px]">
        <h2 data-rise className="text-balance text-[clamp(28px,3.4vw,44px)] font-semibold leading-[1.1] tracking-[-0.034em]">What Standup will never put on your screen.</h2>
        <div className="mt-10 divide-y divide-line-hair">
          {cutItems.map(([title, why]) => (
            <div key={title} data-rise className="py-7">
              <div className="relative inline-block">
                <p className="text-[clamp(19px,2.1vw,27px)] font-medium leading-[1.22] tracking-[-0.025em]">{title}</p>
                <span data-cut-rule className="cut-rule absolute left-0 top-1/2 h-0.5 bg-danger-600" />
              </div>
              <p className="mt-2 text-[15px] leading-[1.55] text-[#9AA4BA]">{why}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SourcesSection() {
  const nameByService = Object.fromEntries(sources.map((source) => [source.id, source.name])) as Record<Service, string>;
  return (
    <section className="bg-bg-alt px-[clamp(20px,4vw,56px)] py-[clamp(80px,10vw,130px)]">
      <div className="mx-auto max-w-[1180px]">
        <h2 data-rise className="text-balance text-[clamp(28px,3.4vw,44px)] font-semibold leading-[1.1] tracking-[-0.034em]">Sources from day zero.</h2>
        <div data-rise className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {sourceStatus.map((source) => (
            <div key={source.service} className={cn("rounded-lg border p-4", source.live ? "border-standup-accent-border bg-standup-accent-surface" : "border-line bg-surface")}>
              <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-md border", source.live ? "border-standup-accent-border text-standup-accent-text" : "border-line-soft text-[#8C96AD]")}>
                <BrandIcon service={source.service} size={18} />
              </span>
              <p className="mt-4 text-sm font-semibold">{nameByService[source.service]}</p>
              <p className={cn("font-mono mt-1 text-[11px]", source.live ? "text-standup-accent-text" : "text-[#79839B]")}>{source.status}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CloseSection() {
  return (
    <>
      <section className="relative overflow-hidden bg-bg-base px-[clamp(20px,4vw,56px)] py-[clamp(90px,12vw,150px)] text-center">
        <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(29,156,76,.2),transparent_68%)]" />
        <div className="relative mx-auto max-w-[780px]">
          <h2 data-rise className="text-balance text-[clamp(34px,5vw,72px)] font-semibold leading-[1.02] tracking-[-0.042em]">Tomorrow morning, open one thing.</h2>
          <p data-rise className="mx-auto mt-5 max-w-[520px] text-[clamp(15px,1.4vw,19px)] leading-[1.55] text-[#9AA4BA]">Understand what matters. Then start building.</p>
          <div data-rise className="mt-9 flex justify-center gap-3">
            <Button asChild size="lg" className="rounded-[9px] bg-standup-accent hover:bg-standup-accent-hover"><Link href="/login">Start setup</Link></Button>
            <Button asChild variant="outline" size="lg" className="rounded-[9px] border-line-strong bg-surface hover:border-line-strongest"><Link href="/today">Preview today</Link></Button>
          </div>
        </div>
      </section>
      <footer className="flex flex-col gap-4 border-t border-line-softer bg-bg-alt px-[clamp(20px,4vw,56px)] py-7 text-xs text-[#9AA4BA] sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2"><BrandMark size={18} />Standup · ranks what needs you · read-only by design</span>
        <span className="flex gap-5">Security · Docs · Changelog</span>
      </footer>
    </>
  );
}
