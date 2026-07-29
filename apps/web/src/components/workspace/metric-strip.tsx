import { AlertTriangle, GitPullRequest, MessagesSquare, Workflow } from "lucide-react";
import { Card } from "@/components/ui/card";

const metrics = [
  { label: "Connected sources", value: "4", icon: Workflow },
  { label: "Waiting review", value: "7", icon: GitPullRequest },
  { label: "Cross-tool blockers", value: "5", icon: AlertTriangle },
  { label: "Decisions found", value: "18", icon: MessagesSquare },
];

export function MetricStrip() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card key={metric.label} className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">{metric.label}</span>
            <metric.icon className="h-4 w-4 text-zinc-400" />
          </div>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{metric.value}</p>
        </Card>
      ))}
    </div>
  );
}
