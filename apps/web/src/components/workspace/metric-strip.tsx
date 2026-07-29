import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export type MetricItem = {
  label: string;
  value: string;
  icon: LucideIcon;
};

export function MetricStrip({ metrics }: { metrics: MetricItem[] }) {
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
