import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { issues } from "@/lib/product-data";

export default async function IssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issue = issues.find((item) => item.id === id);
  if (!issue) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Badge tone={issue.priority === "P1" ? "amber" : "neutral"}>{issue.priority}</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{issue.title}</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {issue.repository} #{issue.number} · assigned to {issue.assignee}
        </p>
      </div>
      <Card className="p-5">
        <h2 className="text-base font-semibold">Work event context</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          This issue is prioritized because it affects initial synchronization, the first durable GitHub integration workflow in the MVP.
          Related PRs, failed jobs, and comments will be attached here as normalized events.
        </p>
      </Card>
    </div>
  );
}
