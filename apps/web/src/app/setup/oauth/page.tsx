import Link from "next/link";
import { Check } from "lucide-react";
import { SetupShell } from "@/components/setup/setup-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrandIcon } from "@/features/integrations/icons";
import { sources } from "@/features/wave-one/design-data";
import { advanceHref, parseOAuthQueue, retryHref } from "@/features/setup/oauth-queue";
import { cn } from "@/lib/utils";

type SetupOauthPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const READ_ONLY_SCOPES = [
  "Read pull requests, reviews and comments",
  "Read issues and linked references",
  "Read commit checks and merge status",
];

export default async function SetupOauthPage({ searchParams }: SetupOauthPageProps) {
  const params = await searchParams;
  const queue = parseOAuthQueue(params);
  const source = sources.find((item) => item.id === queue.current);
  const failed = params.error === "access_denied";

  if (!source) {
    return (
      <SetupShell currentStep={1}>
        <section className="flex min-h-[calc(100vh-60px)] items-center justify-center px-5 py-14">
          <Card className="w-full max-w-[440px] border-[#212938] p-6 text-center">
            <h1 className="text-[20px] font-semibold tracking-[-0.02em]">Nothing left to authorize</h1>
            <p className="mt-2 text-[13.5px] leading-normal text-[#9AA4BA]">
              This authorization link has no sources in it. Pick what you want to connect and Standup will walk through
              them one at a time.
            </p>
            <Button asChild className="mt-5 w-full">
              <Link href="/setup/connect">Back to sources</Link>
            </Button>
          </Card>
        </section>
      </SetupShell>
    );
  }

  return (
    <SetupShell currentStep={1}>
      <section className="flex min-h-[calc(100vh-60px)] items-center justify-center px-5 py-14">
        <div className="w-full max-w-[440px] animate-dos-rise">
          {queue.services.length > 1 ? (
            <ol className="mb-[18px] flex flex-wrap items-center justify-center gap-2">
              {queue.services.map((service, index) => {
                const item = sources.find((entry) => entry.id === service);
                const state = index < queue.index ? "done" : index === queue.index ? "current" : "pending";
                return (
                  <li
                    key={service}
                    aria-current={state === "current" ? "step" : undefined}
                    className={cn(
                      "flex items-center gap-[7px] rounded-full border px-3 py-[5px] pl-[9px]",
                      state === "current"
                        ? "border-[var(--standup-accent-border)] bg-[var(--standup-accent-surface)] text-[var(--standup-accent-text)]"
                        : state === "done"
                          ? "border-[#212938] bg-[#121826] text-[#9AA4BA]"
                          : "border-[#212938] bg-[#121826] text-[#79839B]",
                    )}
                  >
                    <BrandIcon service={service} size={13} />
                    <span className="text-[12px] font-medium">{item?.name ?? service}</span>
                  </li>
                );
              })}
            </ol>
          ) : null}

          {failed ? (
            <Card className="border-[#3A2130] p-8">
              <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-[12px] border border-[#3A2130] bg-[#22141C] font-mono text-[18px] text-[#FF6B8A]">
                !
              </span>
              <h1 className="text-[20px] font-semibold tracking-[-0.02em]">
                {source.name} authorization was cancelled
              </h1>
              <p className="mt-2 text-[14px] leading-[1.5] text-[#9AA4BA]">
                {source.name} returned <span className="font-mono text-[12.5px] text-[#FF6B8A]">access_denied</span>.
                Nothing was stored and no data was read.
              </p>
              <div className="mt-5 rounded-[10px] border border-[#1B2230] bg-[#0F1421] p-4">
                <p className="text-[12px] font-medium">Two common causes</p>
                <p className="mt-2 text-[12.5px] leading-[1.55] text-[#8C96AD]">
                  The workspace requires an admin to approve third-party apps, or the window was closed before the grant
                  finished.
                </p>
              </div>
              <div className="mt-[22px] flex gap-[10px]">
                <Button asChild className="flex-1">
                  <a href={retryHref(queue)}>Try again</a>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/setup/connect">Request admin approval</Link>
                </Button>
              </div>
              {/* One failure never kills the queue. */}
              <Button asChild variant="ghost" className="mt-3 w-full text-[13px] text-[#9AA4BA]">
                <a href={advanceHref(queue)}>Skip this one and continue</a>
              </Button>
            </Card>
          ) : (
            <>
              <Card className="border-[#212938] p-8 text-center">
                <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-[12px] border border-[var(--standup-accent-border)] bg-[var(--standup-accent-surface)] text-[var(--standup-accent-text)]">
                  <Check className="h-5 w-5" />
                </span>
                <h1 className="text-[20px] font-semibold tracking-[-0.02em]">{source.name} connected</h1>
                <p className="mt-2 text-[14px] leading-[1.5] text-[#9AA4BA]">
                  Authorized as <span className="font-mono text-[13px] text-[#E9EDF7]">{source.owner}</span> ·{" "}
                  {source.count} {source.resLabel.toLowerCase()} visible.
                </p>
                <div className="mt-6 flex flex-col gap-[9px] rounded-[10px] border border-[#1B2230] bg-[#0F1421] p-4 text-left">
                  {READ_ONLY_SCOPES.map((scope) => (
                    <p key={scope} className="flex items-center gap-[9px] text-[12.5px] text-[#9AA4BA]">
                      <span className="h-1 w-1 rounded-full bg-[var(--standup-accent)]" />
                      {scope}
                    </p>
                  ))}
                </div>
                <Button asChild className="mt-6 w-full">
                  <a href={advanceHref(queue)}>
                    {queue.isLast
                      ? "Choose what to sync"
                      : `Continue to ${sources.find((item) => item.id === queue.next)?.name ?? "the next tool"}`}
                  </a>
                </Button>
              </Card>
              <p className="mt-4 text-center text-[12px] text-[#79839B]">
                Read-only. Standup never writes back to your tools.
              </p>
            </>
          )}
        </div>
      </section>
    </SetupShell>
  );
}
