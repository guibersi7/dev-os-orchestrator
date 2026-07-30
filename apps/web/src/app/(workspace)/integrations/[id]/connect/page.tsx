import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getIntegrationCatalogItem } from "@/features/integrations/catalog";
import { startOAuthConnection } from "@/lib/api-client";

export default async function ConnectIntegrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const integration = getIntegrationCatalogItem(id);

  if (!integration) {
    redirect("/settings");
  }

  const oauthState = await startOAuthConnection(integration.id);
  const data = oauthState.data;

  if (data?.authorizationUrl) {
    redirect(data.authorizationUrl);
  }

  const Icon = integration.icon;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/settings" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-brand-primary">
        <ArrowLeft className="h-4 w-4" />
        Back to settings
      </Link>

      <Card className="p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-md bg-brand-primary text-white">
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <Badge tone={data?.status === "needs_config" ? "amber" : "red"}>
              {data?.status?.replaceAll("_", " ") ?? "Connection unavailable"}
            </Badge>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Connect {integration.name}</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{integration.scope}</p>
          </div>
        </div>

        <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Provider configuration is required before OAuth can start.</p>
              <p className="mt-1">
                Add the missing server-side OAuth environment variables to the API Gateway environment and retry.
              </p>
              {data?.missing?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.missing.map((env) => (
                    <code key={env} className="rounded-md bg-white px-2 py-1 text-xs text-amber-950">
                      {env}
                    </code>
                  ))}
                </div>
              ) : null}
              {oauthState.error ? <p className="mt-2">{oauthState.error}</p> : null}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/settings">
            <Button variant="secondary">Return to Connection Center</Button>
          </Link>
          <Link href={`/integrations/${integration.id}`}>
            <Button variant="ghost">
              View connector details
              <ExternalLink className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
