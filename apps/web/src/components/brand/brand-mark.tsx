import { cn } from "@/lib/utils";

type StandupMarkProps = {
  className?: string;
  size?: number;
  title?: string;
  variant?: "default" | "mono" | "reversed";
};

export function StandupMark({ className, size = 24, title = "Standup", variant = "default" }: StandupMarkProps) {
  const resolvedSize = Math.max(size, 16);
  // At favicon scale the third bar (opacity .34) turns to noise, so drop it and
  // widen the remaining two — matches public/icon-16.svg.
  const compact = size <= 16;
  const accent = variant === "mono" ? "#E9EDF7" : variant === "reversed" ? "#0E2418" : "#1D9C4C";
  const bar = variant === "mono" ? "#080C15" : "#EEF3FF";

  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title || undefined}
      className={cn("shrink-0", className)}
      fill="none"
      height={resolvedSize}
      role={title ? "img" : undefined}
      viewBox="0 0 24 24"
      width={resolvedSize}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <rect width="24" height="24" rx="7" fill={accent} />
      {compact ? (
        <>
          <rect x="5" y="8" width="14" height="3.6" rx="1.8" fill={bar} />
          <rect x="5" y="13.2" width="9" height="3.6" rx="1.8" fill={bar} opacity=".66" />
        </>
      ) : (
        <>
          <rect x="6" y="6" width="12" height="3.2" rx="1.6" fill={bar} />
          <rect x="6" y="10.4" width="9.5" height="3.2" rx="1.6" fill={bar} opacity=".62" />
          <rect x="6" y="14.8" width="6.8" height="3.2" rx="1.6" fill={bar} opacity=".34" />
        </>
      )}
    </svg>
  );
}

export function BrandMark(props: StandupMarkProps) {
  return <StandupMark {...props} />;
}
