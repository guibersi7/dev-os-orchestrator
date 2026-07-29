import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { pullRequests, workEvents } from "@/lib/product-data";

export default async function PullRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pr = pullRequests.find((item) => item.id === id);
  if (!pr) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Badge tone={pr.status === "blocked" || pr.status === "checks_failed" ? "red" : "amber"}>
          {pr.status.replace("_", " ")}
        </Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{pr.title}</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {pr.repository} #{pr.number} · opened by {pr.author} · {pr.age}
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-5">
          <h2 className="text-base font-semibold">Why this matters</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            This pull request changes authentication flow behavior and has active release impact. Developer OS treats its reviews,
            checks, comments, and release relationship as work events rather than isolated GitHub records.
          </p>
          <div className="mt-6 space-y-4">
            {workEvents.slice(0, 3).map((event) => (
              <div key={event.id} className="rounded-md border border-zinc-200 p-4">
                <p className="text-sm font-medium">{event.title}</p>
                <p className="mt-1 text-sm text-zinc-600">{event.summary}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="text-base font-semibold">Signals</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-zinc-500">Reviews</dt><dd>{pr.reviews}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Comments</dt><dd>{pr.comments}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Changed files</dt><dd>{pr.changedFiles}</dd></div>
            <div className="flex justify-between"><dt className="text-zinc-500">Blocks</dt><dd>{pr.blocksRelease ?? "None"}</dd></div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
