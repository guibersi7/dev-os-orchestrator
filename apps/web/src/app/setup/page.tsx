import Link from "next/link";
import { SetupShell } from "@/components/setup/setup-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const roles = [
  ["Writing code", "Ranks review requests, failing checks and your own unfinished work first."],
  ["Leading a team", "Ranks what blocks other people, then what blocks the cycle."],
  ["Managing delivery", "Ranks risk to dates, stalled work and people waiting too long."],
];

export default function SetupPage() {
  return (
    <SetupShell currentStep={0}>
      <section className="mx-auto w-full max-w-[560px] px-5 py-16">
        <div className="animate-dos-rise">
          <h1 className="text-balance text-[30px] font-semibold leading-[1.15] tracking-[-0.03em]">Set up your workspace</h1>
          <p className="mt-3 text-[15px] leading-normal text-[#9AA4BA]">Two answers. They decide what lands at the top of your morning.</p>
          <div className="mt-8 space-y-6">
            <div>
              <label htmlFor="workspace-name" className="text-sm font-medium">
                Workspace name
              </label>
              <Input id="workspace-name" defaultValue="Bersi Labs" className="mt-2 h-11 border-[#212938] bg-[#121826] focus-visible:border-[var(--standup-accent)] focus-visible:ring-[rgba(29,156,76,.5)]" />
              <p className="mt-2 text-[12.5px] text-[#6A7489]">Everyone you invite sees the same normalized event stream.</p>
            </div>
            <div>
              <p className="text-sm font-medium">How do you spend most of your week?</p>
              <p className="mt-1 text-[12.5px] text-[#6A7489]">Changes ranking, not features.</p>
              <div className="mt-3 space-y-3">
                {roles.map(([title, desc], index) => {
                  const selected = index === 1;
                  return (
                    <Card key={title} className={`cursor-pointer p-4 transition-colors ${selected ? "border-[var(--standup-accent)] bg-[#1A2130]" : "border-[#212938] bg-[#121826] hover:border-[#2A3345]"}`}>
                      <div className="flex gap-3">
                        <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border ${selected ? "border-[var(--standup-accent)] bg-[var(--standup-accent)]" : "border-[#2A3345] bg-[#121826]"}`}>
                          {selected ? <span className="h-2 w-2 rounded-full bg-[#121826]" /> : null}
                        </span>
                        <span>
                          <span className="block text-sm font-semibold">{title}</span>
                          <span className="mt-1 block text-[13px] leading-normal text-[#9AA4BA]">{desc}</span>
                        </span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button asChild>
                <Link href="/setup/connect">Continue</Link>
              </Button>
              <span className="text-[12.5px] text-[#6A7489]">Next: connect your first tool</span>
            </div>
          </div>
        </div>
      </section>
    </SetupShell>
  );
}
