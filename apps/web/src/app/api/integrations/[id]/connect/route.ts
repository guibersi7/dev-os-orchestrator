import { NextResponse } from "next/server";
import { getIntegrationCatalogItem } from "@/features/integrations/catalog";
import { startOAuthConnection } from "@/lib/api-client";

function appUrl(request: Request, path: string) {
  return new URL(path, request.url);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const integration = getIntegrationCatalogItem(id);

  if (!integration) {
    return NextResponse.redirect(appUrl(request, "/onboarding?connectionError=unknown_service"));
  }

  const oauthState = await startOAuthConnection(integration.id);
  const authorizationUrl = oauthState.data?.authorizationUrl;

  if (authorizationUrl) {
    return NextResponse.redirect(authorizationUrl);
  }

  const missing = oauthState.data?.missing?.join(",") ?? "";
  const error = oauthState.data?.status === "needs_config" ? "needs_config" : "oauth_start_failed";
  const nextUrl = appUrl(
    request,
    `/onboarding?connectionError=${error}&service=${integration.id}&missing=${encodeURIComponent(missing)}`,
  );

  return NextResponse.redirect(nextUrl);
}
