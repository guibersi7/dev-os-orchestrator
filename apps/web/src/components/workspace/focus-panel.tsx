import { ArrowUpRight, Sparkles } from "lucide-react";
import { focusItems } from "@/lib/product-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function FocusPanel() {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-zinc-500" />
        <h2 className="text-base font-semibold">Focus</h2>
      </div>
      <div className="mt-5 space-y-4">
        {focusItems.map((item) => (
          <div key={item.title} className="rounded-md border border-zinc-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <Badge tone={item.severity === "high" ? "red" : "amber"}>{item.severity}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{item.reason}</p>
            <Button variant="ghost" size="sm" className="mt-3 px-0">
              {item.action}
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
