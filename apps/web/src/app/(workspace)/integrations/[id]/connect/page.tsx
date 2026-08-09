import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandIcon } from "@/features/integrations/icons";
import { Card } from "@/components/ui/card";
import { getIntegrationCatalogItem } from "@/features/integrations/catalog";

export default async function ConnectIntegrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const integration = getIntegrationCatalogItem(id);

  if (!integration) {
    redirect("/settings");
  }

  const connect = integration.connect;

  if (!connect) {
    redirect(`/api/integrations/${integration.id}/connect`);
  }


  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-brand-primary text-[#E9EDF7]">
            <BrandIcon service={integration.id} size={22} />
          </span>
          <div className="min-w-0">
            <Badge tone="blue">{integration.name} OAuth</Badge>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">{connect.preConnectTitle}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{connect.preConnectDescription}</p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold">What Standup will request</h2>
        <div className="mt-4 space-y-3">
          {connect.permissionBullets.map((bullet) => (
            <div key={bullet} className="flex gap-3 text-sm leading-6">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#6EE7B7]" />
              <p className="text-muted-foreground">{bullet}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <a href={`/api/integrations/${integration.id}/connect`}>
              {connect.oauthCtaLabel}
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <Button asChild variant="secondary">
            <a href="/settings">Back to Connection Center</a>
          </Button>
        </div>
      </Card>
    </div>
  );
}
