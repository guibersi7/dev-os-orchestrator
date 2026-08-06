import { Check } from "lucide-react";
import { SetupShell } from "@/components/setup/setup-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { defaultConnectedIds, sources } from "@/features/wave-one/design-data";

export default function SetupConnectPage() {
  const selectedCount = defaultConnectedIds.length;
  const [github, ...otherSources] = sources;

  return (
    <SetupShell currentStep={1}>
      <section className="mx-auto w-full max-w-[780px] px-5 py-14">
        <div className="animate-dos-rise">
          <h1 className="text-balance text-[30px] font-semibold leading-[1.15] tracking-[-0.03em]">Connect your sources</h1>
          <p className="mt-3 text-[15px] leading-normal text-[#9AA4BA]">
            Pick everything you want in from day one. One tool already answers what should I do now. Three make the answer hard to argue with.
          </p>

          <Card className="mt-8 border-[var(--standup-accent)] bg-gradient-to-b from-[#1A2130] to-[#121826] p-5">
            <div className="flex items-center justify-between gap-5">
              <div className="flex gap-4">
                <span className="font-mono flex h-10 w-10 items-center justify-center rounded-md bg-[#1A2130] text-[12px] text-[#E9EDF7]">{github.tag}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">{github.name}</h2>
                    <span className="rounded-full bg-[var(--standup-accent-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--standup-accent-text)]">recommended</span>
                  </div>
                  <p className="mt-1 text-[13px] text-[#9AA4BA]">{github.unlocks}</p>
                </div>
              </div>
              <span className="flex items-center gap-2 text-sm font-medium text-[var(--standup-accent-text)]">
                <span className="flex h-[19px] w-[19px] items-center justify-center rounded-[5px] bg-[var(--standup-accent)] text-[#E9EDF7]">
                  <Check className="h-3 w-3" />
                </span>
                Selected
              </span>
            </div>
          </Card>

          <div className="mt-4 overflow-hidden rounded-[13px] border border-[#212938] bg-[#121826]">
            {otherSources.map((source) => {
              const selected = defaultConnectedIds.includes(source.id);
              return (
                <div key={source.id} className={`flex items-center justify-between gap-5 border-b border-[#212938] p-4 last:border-b-0 ${selected ? "bg-[#1A2130]" : "bg-[#121826]"}`}>
                  <div className="flex gap-3">
                    <span className="font-mono flex h-8 w-8 items-center justify-center rounded-md bg-[#1A2130] text-[11px] text-[#9AA4BA]">{source.tag}</span>
                    <div>
                      <p className="text-sm font-semibold">{source.name}</p>
                      <p className="mt-1 text-[12.5px] text-[#9AA4BA]">{source.unlocks}</p>
                    </div>
                  </div>
                  <span className={`flex items-center gap-2 text-[12.5px] ${selected ? "text-[var(--standup-accent-text)]" : "text-[#6A7489]"}`}>
                    {selected ? "Selected" : "Add"}
                    <span className={`h-[19px] w-[19px] rounded-[5px] border ${selected ? "border-[var(--standup-accent)] bg-[var(--standup-accent)]" : "border-[#2A3345] bg-[#121826]"}`} />
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#6A7489]">Add now, or later from Settings</p>
              <p className="mt-1 text-[13px] text-[#9AA4BA]">Each source adds signal, not screens.</p>
            </div>
            <div className="text-right">
              <Button asChild>
                <a href={`/api/integrations/github/connect?queue=${defaultConnectedIds.join(",")}&i=0`}>Authorize {selectedCount} tools</a>
              </Button>
              <p className="mt-2 max-w-[300px] text-[12.5px] text-[#6A7489]">You will authorize them one after another. Each one takes about 20 seconds.</p>
            </div>
          </div>
        </div>
      </section>
    </SetupShell>
  );
}
