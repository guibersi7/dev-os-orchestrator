import { NextResponse } from "next/server";
import { getIntegrationCatalogItem } from "@/features/integrations/catalog";
import { startOAuthConnection } from "@/lib/api-client";
import { getPublicAppUrl } from "@/lib/app-url";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const integration = getIntegrationCatalogItem(id);

  if (!integration) {
    return NextResponse.redirect(getPublicAppUrl("/settings?connectionError=unknown_service", request.url));
  }

  const callbackUrl = getPublicAppUrl(`/api/integrations/${integration.id}/callback`, request.url).toString();
  const oauthState = await startOAuthConnection(integration.id, callbackUrl);
  const authorizationUrl = oauthState.data?.authorizationUrl;

  if (authorizationUrl) {
    return NextResponse.redirect(authorizationUrl);
  }

  const missing = oauthState.data?.missing?.join(",") ?? "";
  const error = oauthState.data?.status === "needs_config" ? "needs_config" : "oauth_start_failed";
  const nextUrl = getPublicAppUrl(
    `/settings?connectionError=${error}&service=${integration.id}&missing=${encodeURIComponent(missing)}`,
    request.url,
  );

  return NextResponse.redirect(nextUrl);
}
