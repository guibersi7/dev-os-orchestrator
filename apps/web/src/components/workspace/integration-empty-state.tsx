import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type IntegrationEmptyStateProps = {
  title: string;
  description: string;
  service?: string;
  icon?: LucideIcon;
  actionLabel?: string;
};

export function IntegrationEmptyState({
  title,
  description,
  service,
  icon: Icon,
  actionLabel = "Connect app",
}: IntegrationEmptyStateProps) {
  return (
    <Card className="flex min-h-[320px] flex-col items-center justify-center border-dashed bg-[color-mix(in_srgb,var(--brand-surface)_45%,transparent)] p-8 text-center">
      {Icon ? (
        <span className="flex h-12 w-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Icon className="h-6 w-6" />
        </span>
      ) : null}
      <h2 className="mt-5 max-w-xl text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
      {service ? (
        <Button asChild className="mt-6">
          <Link href={`/api/integrations/${service}/connect`}>
            {actionLabel}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      ) : null}
    </Card>
  );
}
