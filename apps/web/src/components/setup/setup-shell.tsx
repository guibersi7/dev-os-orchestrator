import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";
import { HeaderAuthControl } from "@/components/auth/header-auth-control";
import { getInitialAuthSession } from "@/lib/auth-session";
import { cn } from "@/lib/utils";

const steps = ["Workspace", "Connect", "Select", "Sync"];

export async function SetupShell({ currentStep, children }: { currentStep: number; children: React.ReactNode }) {
  const authSession = await getInitialAuthSession();

  return (
    <main className="min-h-screen bg-[#080C15] text-[#E9EDF7]">
      <header className="flex h-[60px] items-center justify-between border-b border-[#212938] bg-[#121826] px-8">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark />
          <span className="text-sm font-semibold tracking-[-0.01em]">Standup</span>
        </Link>
        <ol className="hidden items-center gap-5 md:flex">
          {steps.map((step, index) => {
            const active = index === currentStep;
            const done = index < currentStep;
            return (
              <li key={step} className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-[18px] w-[18px] items-center justify-center rounded-full border text-[10px] font-medium",
                    done && "border-primary bg-primary text-[#E9EDF7]",
                    active && "border-transparent bg-[var(--standup-accent-surface)] text-[var(--standup-accent-text)]",
                    !done && !active && "border-[#212938] bg-[#121826] text-[#6A7489]",
                  )}
                >
                  {index + 1}
                </span>
                <span className={cn("text-xs", index <= currentStep ? "text-[#E9EDF7]" : "text-[#6A7489]")}>{step}</span>
              </li>
            );
          })}
        </ol>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.08em] text-[#6A7489] sm:inline">Wave 1</span>
          <HeaderAuthControl session={authSession} />
        </div>
      </header>
      {children}
    </main>
  );
}
