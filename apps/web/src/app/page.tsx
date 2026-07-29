import Link from "next/link";
import { ArrowRight, GitPullRequest, MessagesSquare, Sparkles, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { integrations } from "@/lib/product-data";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <section className="flex min-h-screen items-center border-b border-zinc-200 px-4 py-16 sm:px-6">
        <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[1fr_440px] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-1 text-sm text-zinc-600">
              <Sparkles className="h-4 w-4" />
              Multi-service engineering intelligence
            </div>
            <h1 className="mt-7 max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
              Developer OS
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-600">
              Start the day with the code, planning, docs, meetings, and conversations that actually need attention.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/onboarding">
                <Button>
                  <GitPullRequest className="h-4 w-4" />
                  Connect workspace
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="secondary">
                  View demo
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <div className="rounded-md bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-zinc-500">Focus recommendation</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                OAuth work is blocking Mobile beta 0.8
              </h2>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                GitHub shows a stale review, Slack confirms the release dependency, and Linear moved the sync risk into the current cycle.
              </p>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
                <span className="rounded-md bg-red-50 p-3 text-red-700">GitHub</span>
                <span className="rounded-md bg-sky-50 p-3 text-sky-700">Slack</span>
                <span className="rounded-md bg-zinc-100 p-3 text-zinc-700">Linear</span>
              </div>
              <div className="mt-5 space-y-2">
                {integrations.slice(0, 4).map((integration) => (
                  <div key={integration.id} className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      {integration.id === "github" ? <GitPullRequest className="h-4 w-4" /> : integration.id === "slack" ? <MessagesSquare className="h-4 w-4" /> : <Workflow className="h-4 w-4" />}
                      {integration.name}
                    </span>
                    <span className="text-zinc-500">{integration.connected ? "Connected" : "Optional"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
