import { cn } from "@/lib/utils";

type StandupMarkProps = {
  className?: string;
  size?: number;
  title?: string;
  variant?: "default" | "mono" | "reversed";
};

export function StandupMark({ className, size = 24, title = "Standup", variant = "default" }: StandupMarkProps) {
  const resolvedSize = Math.max(size, 16);
  const compact = size < 16;
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
      <rect x="6" y="6" width="12" height="3.2" rx="1.6" fill={bar} />
      {!compact ? <rect x="6" y="10.4" width="9.5" height="3.2" rx="1.6" fill={bar} opacity=".62" /> : null}
      {!compact ? <rect x="6" y="14.8" width="6.8" height="3.2" rx="1.6" fill={bar} opacity=".34" /> : null}
    </svg>
  );
}

export function BrandMark(props: StandupMarkProps) {
  return <StandupMark {...props} />;
}
