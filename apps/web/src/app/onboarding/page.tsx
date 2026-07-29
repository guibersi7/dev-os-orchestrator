import Link from "next/link";
import { CheckCircle2, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { integrations } from "@/lib/product-data";

const steps = ["Create workspace", "Connect code and planning tools", "Connect communication and docs", "Start normalized event sync"];

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">Create your Developer OS workspace</h1>
        <p className="mt-3 text-zinc-600">Connect the services your team already uses. Every synced object becomes a normalized work event.</p>
        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-950 text-white">
              <Workflow className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">Workspace connectors</h2>
              <p className="text-sm text-zinc-500">Read engineering activity across GitHub, Slack, Linear, Jira, Trello, Notion, and Calendar.</p>
            </div>
          </div>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {integrations.map((integration) => (
              <div key={integration.id} className="rounded-md border border-zinc-200 p-3">
                <p className="text-sm font-medium">{integration.name}</p>
                <p className="mt-1 text-xs text-zinc-500">{integration.scope}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-3">
            {steps.map((step, index) => (
              <div key={step} className="flex items-center gap-3 text-sm">
                <CheckCircle2 className={index === 0 ? "h-4 w-4 text-emerald-600" : "h-4 w-4 text-zinc-300"} />
                {step}
              </div>
            ))}
          </div>
          <Link href="/repositories">
            <Button className="mt-6">Continue</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
