import Link from "next/link";
import { SetupShell } from "@/components/setup/setup-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { defaultConnectedIds, sources } from "@/features/wave-one/design-data";

export default function SetupResourcesPage() {
  const connected = sources.filter((source) => defaultConnectedIds.includes(source.id));
  const active = connected[0];
  const selectedCount = connected.reduce((total, source) => total + source.items.filter((item) => item.hot).length, 0);
  const estEvents = connected.reduce((total, source) => total + source.items.filter((item) => item.hot).reduce((sum, item) => sum + item.est, 0), 0);

  return (
    <SetupShell currentStep={2}>
      <section className="mx-auto grid w-full max-w-[1000px] gap-8 px-5 py-12 lg:grid-cols-[minmax(420px,1fr)_300px] lg:gap-12">
        <div className="animate-dos-rise">
          <h1 className="text-balance text-[30px] font-semibold leading-[1.15] tracking-[-0.03em]">What should we watch?</h1>
          <p className="mt-3 text-[15px] leading-normal text-[#9AA4BA]">Per source, pick only what you actually work in. Noise here becomes noise in your morning.</p>
          <div className="mt-7 flex flex-wrap gap-2" role="tablist">
            {connected.map((source, index) => (
              <button key={source.id} className={`rounded-full border px-3 py-1.5 text-[12.5px] ${index === 0 ? "border-[#E9EDF7] bg-[#1A2130] text-[#E9EDF7]" : "border-[#212938] bg-[#121826] text-[#9AA4BA]"}`}>
                {source.name} <span className="font-mono ml-1">{source.items.filter((item) => item.hot).length}</span>
              </button>
            ))}
          </div>
          <Input className="mt-5 h-11 border-[#212938] bg-[#121826]" placeholder={`Search ${active.count} ${active.resLabel.toLowerCase()}...`} />
          <div className="mt-5 flex items-center justify-between gap-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#6A7489]">
              {active.resLabel} · {active.owner}
            </p>
            <button className="text-[12.5px] font-medium text-[var(--standup-accent-text)]">Select only the active ones</button>
          </div>
          <Card className="mt-3 overflow-hidden border-[#212938]">
            {active.items.map((resource) => (
              <label key={resource.id} className={`flex cursor-pointer items-center gap-3 border-b border-[#212938] p-4 last:border-b-0 ${resource.hot ? "bg-[#1A2130]" : "bg-[#121826]"} hover:bg-[#1A2130]`}>
                <Checkbox defaultChecked={resource.hot} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{resource.name}</span>
                  <span className="font-mono mt-1 block truncate text-[11.5px] text-[#6A7489]">{resource.meta}</span>
                </span>
                <span className={`text-right text-[12.5px] ${resource.hot ? "text-[var(--standup-accent-text)]" : "text-[#6A7489]"}`}>{resource.signal}</span>
              </label>
            ))}
          </Card>
        </div>
        <Card className="h-fit border-[#212938] bg-[#0B0F1A] p-5 lg:sticky lg:top-6">
          <h2 className="text-sm font-semibold">First sync</h2>
          <div className="mt-4 space-y-2">
            {connected.map((source) => (
              <div key={source.id} className="flex justify-between gap-3 text-[12.5px]">
                <span className="text-[#9AA4BA]">{source.name}</span>
                <span className="font-medium">{source.items.filter((item) => item.hot).length} of {source.items.length}</span>
              </div>
            ))}
          </div>
          <div className="my-4 border-t border-[#212938]" />
          <SummaryRow label="Resources total" value={selectedCount.toString()} />
          <SummaryRow label="History window" value="30 days" />
          <SummaryRow label="Est. work events" value={estEvents.toLocaleString("en-US")} />
          <div className="mt-5 flex flex-wrap gap-1.5">
            {["review_requested", "checks.failed", "issue.blocked", "thread.unanswered", "meeting.scheduled"].map((type) => (
              <span key={type} className="font-mono rounded bg-[var(--standup-accent-surface)] px-2 py-1 text-[10px] text-[var(--standup-accent-text)]">{type}</span>
            ))}
          </div>
          <Button asChild className="mt-6 w-full">
            <Link href="/setup/sync">Sync {selectedCount} resources</Link>
          </Button>
          <p className="mt-3 text-[12px] leading-normal text-[#6A7489]">Sources sync in parallel. About 40 seconds. You can leave the page.</p>
        </Card>
      </section>
    </SetupShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 flex justify-between gap-3 text-[12.5px]">
      <span className="text-[#9AA4BA]">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}
