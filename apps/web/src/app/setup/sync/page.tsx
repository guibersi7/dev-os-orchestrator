import Link from "next/link";
import { SetupShell } from "@/components/setup/setup-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { defaultConnectedIds, sources } from "@/features/wave-one/design-data";

export default function SetupSyncPage() {
  const connected = sources.filter((source) => defaultConnectedIds.includes(source.id));
  const pct = 100;
  const total = connected.reduce((sum, source) => sum + source.items.filter((item) => item.hot).reduce((itemSum, item) => itemSum + item.est, 0), 0);

  return (
    <SetupShell currentStep={3}>
      <section className="mx-auto w-full max-w-[620px] px-5 py-16">
        <div className="animate-dos-rise">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.03em]">Sync complete</h1>
              <p className="mt-3 text-[15px] leading-normal text-[#9AA4BA]">Every source now speaks the same language. From here, nothing is a GitHub thing or a Slack thing; it is a work event.</p>
            </div>
            <span className="font-mono text-sm text-[#E9EDF7]">{pct}%</span>
          </div>
          <div className="mt-6 h-1 overflow-hidden rounded-full bg-[#212938]" role="progressbar" aria-valuenow={pct}>
            <div className="h-full rounded-full bg-[var(--standup-accent)]" style={{ width: `${pct}%` }} />
          </div>
          <Card className="mt-6 overflow-hidden border-[#212938]">
            {connected.map((source) => (
              <div key={source.id} className="border-b border-[#212938] p-4 last:border-b-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="font-mono flex h-8 w-8 items-center justify-center rounded-md bg-[#1A2130] text-[11px] text-[#9AA4BA]">{source.tag}</span>
                    <div>
                      <p className="text-sm font-medium">{source.name}</p>
                      <p className="text-[12px] text-[#6A7489]">{source.items.filter((item) => item.hot).length} {source.resLabel.toLowerCase()}</p>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-[var(--standup-accent-text)]">done</span>
                </div>
                <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-[#212938]">
                  <div className="h-full rounded-full bg-[var(--standup-accent)]" style={{ width: "100%" }} />
                </div>
              </div>
            ))}
            <div className="bg-[#0B0F1A] p-4">
              <p className="text-[12.5px] text-[#9AA4BA]">Ranking your first morning · <span className="font-mono font-medium text-[#E9EDF7]">{total.toLocaleString("en-US")} work events</span></p>
            </div>
          </Card>
          <Card className="mt-5 border-[var(--standup-accent)] bg-[#1A2130] p-5">
            <h2 className="text-sm font-semibold">Your morning is ready</h2>
            <p className="mt-2 text-[13px] leading-normal text-[#9AA4BA]">{total.toLocaleString("en-US")} work events normalized across {connected.length} sources. Three of them need you before lunch.</p>
            <Button asChild className="mt-5">
              <Link href="/today">Open Standup</Link>
            </Button>
          </Card>
        </div>
      </section>
    </SetupShell>
  );
}
