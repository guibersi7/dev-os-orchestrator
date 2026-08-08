import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { integrationIcon, integrations } from "@/lib/product-data";

export default function RepositorySelectionPage() {
  return (
    <main className="min-h-screen bg-[#0B0F1A] px-4 py-10 text-[#E9EDF7] sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Select sources</h1>
            <p className="mt-2 text-[#9AA4BA]">Choose the services that should feed Standup from day 0.</p>
          </div>
          <Link href="/dashboard">
            <Button>Start sync</Button>
          </Link>
        </div>
        <div className="mt-8 overflow-hidden rounded-lg border border-[#212938] bg-[#121826]">
          {integrations.map((integration) => {
            const Icon = integrationIcon[integration.id];
            return (
            <a
              key={integration.id}
              href={`/integrations/${integration.id}`}
              className="flex flex-wrap items-center justify-between gap-4 border-b border-[#212938] p-4 transition-colors last:border-b-0 hover:bg-[#0B0F1A]"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#1A2130]">
                  <Icon className="h-5 w-5 text-[#9AA4BA]" />
                </span>
                <div>
                  <p className="font-medium">{integration.name}</p>
                  <p className="text-sm text-[#6A7489]">{integration.objects} · {integration.events.toLocaleString()} events</p>
                  <p className="mt-1 text-xs text-[#6A7489]">{integration.scope}</p>
                </div>
              </div>
              <Badge tone={integration.connected ? "green" : "neutral"}>{integration.connected ? "Connected" : "Available"}</Badge>
            </a>
            );
          })}
        </div>
      </div>
    </main>
  );
}
