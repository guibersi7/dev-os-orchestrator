import Link from "next/link";
import { Check } from "lucide-react";
import { SetupShell } from "@/components/setup/setup-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { defaultConnectedIds, sources } from "@/features/wave-one/design-data";

export default function SetupOauthPage() {
  const current = sources[0];

  return (
    <SetupShell currentStep={1}>
      <section className="flex min-h-[calc(100vh-60px)] items-center justify-center px-5 py-14">
        <Card className="w-full max-w-[440px] border-[#212938] p-6">
          <div className="mb-5 flex flex-wrap gap-2">
            {defaultConnectedIds.map((id, index) => {
              const source = sources.find((item) => item.id === id)!;
              return (
                <span key={id} className={`font-mono rounded-full border px-2.5 py-1 text-[11px] ${index === 0 ? "border-transparent bg-[var(--standup-accent-surface)] text-[var(--standup-accent-text)]" : "border-[#212938] bg-[#121826] text-[#6A7489]"}`}>
                  {source.tag}
                </span>
              );
            })}
          </div>
          <span className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-[var(--standup-accent-surface)] text-[var(--standup-accent-text)]">
            <Check className="h-5 w-5" />
          </span>
          <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.03em]">{current.name} connected</h1>
          <p className="mt-2 text-[13.5px] leading-normal text-[#9AA4BA]">
            Authorized as <span className="font-mono text-[#E9EDF7]">{current.owner}</span> · {current.count} {current.resLabel.toLowerCase()} visible.
          </p>
          <div className="mt-5 rounded-[11px] border border-[#212938] bg-[#0B0F1A] p-4">
            {["Read pull requests, reviews and comments", "Read issues and linked references", "Read commit checks and merge status"].map((scope) => (
              <p key={scope} className="mb-2 flex items-center gap-2 text-[12.5px] text-[#9AA4BA] last:mb-0">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--standup-accent)]" />
                {scope}
              </p>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button asChild>
              <Link href="/setup/resources">Choose what to sync</Link>
            </Button>
            <span className="text-[12px] text-[#6A7489]">Read-only. Never writes back.</span>
          </div>
        </Card>
      </section>
    </SetupShell>
  );
}
