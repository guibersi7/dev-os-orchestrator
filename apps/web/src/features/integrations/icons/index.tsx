import { siGithub, siGooglecalendar, siJira, siLinear, siNotion, siTrello } from "simple-icons";
import type { Service } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { SLACK_ICON_PATH } from "@/features/integrations/icons/slack";

/**
 * One source of truth for product icons, consumed by both the app and the
 * landing page. A source is always shown with its real brand mark — a generic
 * glyph standing in for a product is an abstraction the user never asked for.
 *
 * lucide-react stays, but for UI icons only: search, settings, arrows.
 * Never to represent a product.
 */
const BRAND_PATHS: Record<Service, string | null> = {
  github: siGithub.path,
  linear: siLinear.path,
  jira: siJira.path,
  trello: siTrello.path,
  notion: siNotion.path,
  calendar: siGooglecalendar.path,
  // Slack was removed from simple-icons at Slack's own request and will not
  // come back. Until their brand-kit mark is vendored into slack.ts, the tag
  // fallback renders instead — an honest placeholder beats a wrong logo.
  slack: SLACK_ICON_PATH,
};

/** Two-letter fallback, matching the `tag` field on SourceDef. */
const TAGS: Record<Service, string> = {
  github: "gh",
  slack: "sl",
  linear: "li",
  jira: "ji",
  trello: "tr",
  notion: "no",
  calendar: "ca",
};

export type BrandIconProps = {
  service: Service;
  size?: number;
  className?: string;
  title?: string;
};

export function hasBrandIcon(service: Service): boolean {
  return BRAND_PATHS[service] !== null;
}

/**
 * Inherits `currentColor`, so depth tinting is the caller's business:
 * accent-text for the live source, #9AA4BA normally, #8C96AD at one remove,
 * #4A5468 when disconnected.
 */
export function BrandIcon({ service, size = 16, className, title }: BrandIconProps) {
  const path = BRAND_PATHS[service];

  if (!path) {
    return (
      <span
        aria-label={title}
        className={cn("inline-flex items-center justify-center font-mono uppercase", className)}
        role={title ? "img" : undefined}
        style={{ width: size, height: size, fontSize: size * 0.62, lineHeight: 1 }}
      >
        {TAGS[service]}
      </span>
    );
  }

  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn("shrink-0", className)}
      height={size}
      role={title ? "img" : undefined}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <path d={path} fill="currentColor" />
    </svg>
  );
}
