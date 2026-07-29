import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { integrationIcon, integrations } from "@/lib/product-data";

export default function RepositorySelectionPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Select sources</h1>
            <p className="mt-2 text-zinc-600">Choose the services that should feed Developer OS from day 0.</p>
          </div>
          <Link href="/dashboard">
            <Button>Start sync</Button>
          </Link>
        </div>
        <div className="mt-8 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {integrations.map((integration) => {
            const Icon = integrationIcon[integration.id];
            return (
            <Link
              key={integration.id}
              href={`/integrations/${integration.id}`}
              className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 p-4 transition-colors last:border-b-0 hover:bg-zinc-50"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-100">
                  <Icon className="h-5 w-5 text-zinc-600" />
                </span>
                <div>
                  <p className="font-medium">{integration.name}</p>
                  <p className="text-sm text-zinc-500">{integration.objects} · {integration.events.toLocaleString()} events</p>
                  <p className="mt-1 text-xs text-zinc-500">{integration.scope}</p>
                </div>
              </div>
              <Badge tone={integration.connected ? "green" : "neutral"}>{integration.connected ? "Connected" : "Available"}</Badge>
            </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
