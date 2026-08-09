"use client";

import type { CSSProperties } from "react";
import { BrandIcon } from "@/features/integrations/icons";
import type { Service } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type OrbitPill = {
  name: string;
  service: Service;
  ring: "inner" | "middle" | "outer";
  angle: number;
  period: number;
  direction: 1 | -1;
};

const radiusByRing = {
  inner: 310,
  middle: 450,
  outer: 530,
};

const depthByRing = {
  inner: {
    bg: "bg-surface",
    border: "border-line",
    color: "text-[#E9EDF7]",
    icon: "var(--standup-accent-text)",
    text: "text-[14px]",
    size: 16,
    padding: "px-4 py-2.5",
  },
  middle: {
    bg: "bg-surface-2",
    border: "border-line-soft",
    color: "text-[#9AA4BA]",
    icon: "#8C96AD",
    text: "text-[13.5px]",
    size: 15,
    padding: "px-[15px] py-2",
  },
  outer: {
    bg: "bg-surface-3",
    border: "border-line-softer",
    color: "text-[#79839B]",
    icon: "#5C6479",
    text: "text-[13px]",
    size: 14,
    padding: "px-3.5 py-2",
  },
};

const pills: OrbitPill[] = [
  { name: "GitHub", service: "github", ring: "inner", angle: -38, period: 74, direction: 1 },
  { name: "Linear", service: "linear", ring: "inner", angle: 34, period: 74, direction: 1 },
  { name: "Slack", service: "slack", ring: "middle", angle: -64, period: 98, direction: -1 },
  { name: "Notion", service: "notion", ring: "middle", angle: 12, period: 98, direction: -1 },
  { name: "Calendar", service: "calendar", ring: "middle", angle: 78, period: 98, direction: -1 },
  { name: "Jira", service: "jira", ring: "outer", angle: -26, period: 132, direction: 1 },
  { name: "Trello", service: "trello", ring: "outer", angle: 48, period: 132, direction: 1 },
];

export function OrbitSection() {
  return (
    <section
      className="orbit-section overflow-hidden border-t border-line-softer bg-bg-alt px-[clamp(20px,4vw,56px)] py-[clamp(80px,10vw,130px)] pb-10"
      data-rise
      data-orbit-active="true"
    >
      <div className="relative z-[3] mx-auto max-w-[640px] text-center">
        <p className="font-mono mb-5 text-[11px] uppercase tracking-[0.08em] text-[#79839B]">everything you already use</p>
        <h2 className="text-balance text-[clamp(28px,3.4vw,44px)] font-semibold leading-[1.1] tracking-[-0.034em] text-[#E9EDF7]">
          Your work is already everywhere. It just has no center.
        </h2>
        <p className="text-pretty mt-5 text-[clamp(15px,1.4vw,19px)] leading-[1.55] text-[#9AA4BA]">
          Seven tools, each convinced it is the main one. Standup does not ask you to leave any of them - it pulls what happened into a single stream and gives the day a middle.
        </p>
      </div>

      <div className="relative z-[1] mx-auto mt-[clamp(70px,9vw,112px)] h-[clamp(340px,42vw,460px)] max-w-[1180px]">
        <div className="hidden origin-bottom scale-[0.62] md:block lg:scale-[0.8] xl:scale-100">
          <div className="absolute bottom-0 left-1/2 h-0 w-0">
            <OrbitRing className="h-[620px] w-[620px] border-[#161C2B]" diameter={620} />
            <OrbitRing className="h-[900px] w-[900px] border-[#141A28]" diameter={900} />
            <OrbitRing className="h-[1060px] w-[1060px] border-[#121724]" diameter={1060} />
          </div>
          {pills.map((pill) => (
            <OrbitPill key={pill.name} pill={pill} />
          ))}
        </div>

        <div className="mx-auto flex max-w-[520px] flex-wrap justify-center gap-2.5 md:hidden">
          {pills.map((pill) => (
            <StaticPill key={pill.name} pill={pill} />
          ))}
        </div>

        <div className="absolute bottom-[-96px] left-1/2 flex h-56 w-56 -translate-x-1/2 flex-col items-center justify-start gap-3 rounded-full border border-standup-accent-border bg-standup-accent-surface pt-[30px] text-center shadow-[0_0_90px_rgba(29,156,76,.22)]">
          <div className="flex h-[38px] w-[38px] flex-col items-center justify-center gap-[3px] rounded-[11px] bg-standup-accent">
            <span className="h-[3px] w-[18px] rounded-sm bg-[#E9EDF7]" />
            <span className="h-[3px] w-[13px] rounded-sm bg-[#9AA4BA]" />
            <span className="h-[3px] w-2 rounded-sm bg-[#79839B]" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-[-0.01em] text-[#E9EDF7]">One stream</div>
            <div className="font-mono mt-1 text-[11px] text-standup-accent-text">1,284 work events</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function OrbitRing({ className, diameter }: { className?: string; diameter: number }) {
  return <div className={cn("absolute left-0 top-0 rounded-full border", className)} style={{ marginLeft: diameter / -2, marginTop: diameter / -2 }} />;
}

function OrbitPill({ pill }: { pill: OrbitPill }) {
  const radius = radiusByRing[pill.ring];
  const end = pill.angle + 360 * pill.direction;
  const counterEnd = -pill.angle - 360 * pill.direction;

  return (
    <div
      className="orbit-spoke absolute bottom-0 left-1/2 h-0 w-0"
      style={
        {
          "--orbit-counter-end": `${counterEnd}deg`,
          "--orbit-counter-start": `${-pill.angle}deg`,
          "--orbit-end": `${end}deg`,
          "--orbit-period": `${pill.period}s`,
          "--orbit-radius": `${radius}px`,
          "--orbit-start": `${pill.angle}deg`,
        } as CSSProperties
      }
    >
      <div className="orbit-pill-frame absolute left-0 top-0">
        <div className="orbit-pill-inner">
          <ServicePill pill={pill} />
        </div>
      </div>
    </div>
  );
}

function StaticPill({ pill }: { pill: OrbitPill }) {
  return <ServicePill pill={pill} className="justify-center" />;
}

function ServicePill({ pill, className }: { pill: OrbitPill; className?: string }) {
  const depth = depthByRing[pill.ring];

  return (
    <div className={cn("inline-flex items-center gap-[9px] whitespace-nowrap rounded-full border font-medium shadow-[0_10px_30px_-18px_rgba(0,0,0,.8)]", depth.bg, depth.border, depth.color, depth.text, depth.padding, className)}>
      <span style={{ color: depth.icon }}>
        <BrandIcon service={pill.service} size={depth.size} />
      </span>
      <span>{pill.name}</span>
    </div>
  );
}
