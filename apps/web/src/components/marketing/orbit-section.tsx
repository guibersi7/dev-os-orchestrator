"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { siGithub, siGooglecalendar, siJira, siLinear, siNotion, siTrello } from "simple-icons";
import { cn } from "@/lib/utils";

type OrbitIcon = {
  title: string;
  path?: string;
};

type OrbitPill = {
  name: string;
  icon: OrbitIcon;
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

const colorByRing = {
  inner: "var(--standup-accent-text)",
  middle: "#79839B",
  outer: "#5C6479",
};

const pills: OrbitPill[] = [
  { name: "GitHub", icon: siGithub, ring: "inner", angle: -38, period: 74, direction: 1 },
  { name: "Linear", icon: siLinear, ring: "inner", angle: 34, period: 74, direction: 1 },
  { name: "Slack", icon: { title: "Slack" }, ring: "middle", angle: -64, period: 98, direction: -1 },
  { name: "Notion", icon: siNotion, ring: "middle", angle: 12, period: 98, direction: -1 },
  { name: "Calendar", icon: siGooglecalendar, ring: "middle", angle: 78, period: 98, direction: -1 },
  { name: "Jira", icon: siJira, ring: "outer", angle: -26, period: 132, direction: 1 },
  { name: "Trello", icon: siTrello, ring: "outer", angle: 48, period: 132, direction: 1 },
];

export function OrbitSection() {
  const rootRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.24 });
    observer.observe(root);

    const onVisibilityChange = () => setDocumentVisible(document.visibilityState === "visible");
    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <section
      ref={rootRef}
      className="orbit-section overflow-hidden border-t border-line-softer bg-bg-alt px-5 pb-10 pt-24 sm:px-10"
      data-orbit-active={visible && documentVisible ? "true" : "false"}
    >
      <div className="relative z-[3] mx-auto max-w-[640px] text-center">
        <p className="font-mono mb-5 text-[11px] uppercase tracking-[0.08em] text-[#6A7489]">everything you already use</p>
        <h2 className="text-balance text-[38px] font-semibold leading-[1.12] tracking-[-0.032em] text-[#E9EDF7]">
          Your work is already everywhere. It just has no center.
        </h2>
        <p className="text-pretty mt-5 text-base leading-[1.65] text-[#9AA4BA]">
          Seven tools, each convinced it is the main one. Standup does not ask you to leave any of them — it pulls what happened into a single stream and gives the day a middle.
        </p>
      </div>

      <div className="relative z-[1] mx-auto mt-10 h-[340px] max-w-[1180px] sm:mt-16 sm:h-[400px] md:mt-28 md:h-[460px]">
        <div className="hidden md:block">
          <OrbitRing className="h-[620px] w-[620px] border-ring-inner" />
          <OrbitRing className="h-[900px] w-[900px] border-ring-middle" />
          <OrbitRing className="hidden h-[1060px] w-[1060px] border-ring-outer xl:block" />
          {pills.map((pill) => (
            <OrbitPill key={pill.name} pill={pill} />
          ))}
        </div>

        <div className="mx-auto grid max-w-[420px] grid-cols-2 gap-2.5 md:hidden">
          {pills.map((pill) => (
            <StaticPill key={pill.name} pill={pill} />
          ))}
        </div>

        <div className="absolute bottom-[-96px] left-1/2 flex h-56 w-56 -translate-x-1/2 flex-col items-center rounded-full border border-standup-accent-border bg-standup-accent-surface pt-[30px] text-center shadow-[0_0_90px_rgba(29,156,76,.22)]">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-standup-accent-text">1,284 work events</span>
          <span className="mt-5 text-[30px] font-semibold tracking-[-0.03em] text-[#E9EDF7]">One stream</span>
        </div>
      </div>
    </section>
  );
}

function OrbitRing({ className }: { className?: string }) {
  return <div className={cn("absolute bottom-0 left-1/2 rounded-full border -translate-x-1/2 translate-y-1/2", className)} />;
}

function OrbitPill({ pill }: { pill: OrbitPill }) {
  const radius = radiusByRing[pill.ring];
  const color = colorByRing[pill.ring];
  const end = pill.angle + 360 * pill.direction;
  const counterEnd = -pill.angle - 360 * pill.direction;

  return (
    <div
      className={cn("orbit-spoke absolute bottom-0 left-1/2 h-0 w-0", pill.ring === "outer" && "hidden xl:block")}
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
          <ServicePill icon={pill.icon} name={pill.name} color={color} />
        </div>
      </div>
    </div>
  );
}

function StaticPill({ pill }: { pill: OrbitPill }) {
  return <ServicePill icon={pill.icon} name={pill.name} color={colorByRing[pill.ring]} className="justify-center" />;
}

function ServicePill({ icon, name, color, className }: { icon: OrbitIcon; name: string; color: string; className?: string }) {
  return (
    <div className={cn("inline-flex h-10 items-center gap-2 rounded-full border border-line-soft bg-surface px-3 text-[12.5px] font-medium text-[#E9EDF7]", className)}>
      {icon.path ? (
        <svg aria-hidden="true" className="h-4 w-4" fill={color} role="img" viewBox="0 0 24 24">
          <path d={icon.path} />
        </svg>
      ) : (
        <span className="font-mono text-[11px]" style={{ color }}>
          {name.slice(0, 2)}
        </span>
      )}
      <span>{name}</span>
    </div>
  );
}
