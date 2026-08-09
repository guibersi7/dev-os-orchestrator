import type { ConnectionStatus, Service } from "@/lib/api-client";
import type { AuthUser } from "@/lib/auth-session";
import type { WorkEvent } from "@/lib/work-event";

/**
 * The dashboard payload does not say who is looking at it — `WorkEvent` only
 * carries `actor`. Identity is therefore assembled on the client side from what
 * the app already knows: the account each connection authorized as, plus the
 * signed-in user's email and name.
 *
 * When none of that matches anything in the payload the queue degrades to
 * workspace mode rather than guessing.
 */
export type ViewerIdentity = {
  handles: Set<string>;
  byService: Partial<Record<Service, string>>;
  resolved: boolean;
};

function normalize(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase().replace(/^@/, "");
}

export function buildViewerIdentity(
  user: AuthUser | null,
  connections: ConnectionStatus[],
  events: WorkEvent[] = [],
): ViewerIdentity {
  const handles = new Set<string>();
  const byService: Partial<Record<Service, string>> = {};

  for (const connection of connections) {
    const account = normalize(connection.providerAccountId);
    if (account) {
      byService[connection.service] = account;
      handles.add(account);
    }
  }

  const email = normalize(user?.email);
  if (email) {
    handles.add(email);
    // `ana@acme.com` and the GitHub login `ana` are frequently the same person.
    const localPart = email.split("@")[0];
    if (localPart) handles.add(localPart);
  }

  const name = normalize(user?.name);
  if (name) handles.add(name);

  // An identity nobody in the payload answers to is not an identity. Connection
  // accounts count on their own, since they came from the provider itself.
  const hasProviderAccount = Object.keys(byService).length > 0;
  const matchesSomething = events.some((event) => handles.has(normalize(event.actor)));

  return { handles, byService, resolved: hasProviderAccount || matchesSomething };
}

export function isViewerActor(event: WorkEvent, identity: ViewerIdentity): boolean {
  if (!identity.resolved) {
    return false;
  }

  const actor = normalize(event.actor);
  if (!actor) {
    return false;
  }

  const forService = identity.byService[event.service];
  if (forService && forService === actor) {
    return true;
  }

  return identity.handles.has(actor);
}

export const anonymousViewer: ViewerIdentity = {
  handles: new Set(),
  byService: {},
  resolved: false,
};
