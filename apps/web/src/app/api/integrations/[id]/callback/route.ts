import { NextResponse } from "next/server";
import { getIntegrationCatalogItem } from "@/features/integrations/catalog";
import { completeOAuthConnection } from "@/lib/api-client";

function appUrl(request: Request, path: string) {
  return new URL(path, request.url);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const integration = getIntegrationCatalogItem(id);

  if (!integration) {
    return NextResponse.redirect(appUrl(request, "/onboarding?connectionError=unknown_service"));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  if (providerError || !code || !state) {
    return NextResponse.redirect(
      appUrl(request, `/onboarding?connectionError=oauth_callback_failed&service=${integration.id}`),
    );
  }

  const callbackState = await completeOAuthConnection(integration.id, code, state);

  if (callbackState.error || callbackState.data?.status !== "connected") {
    return NextResponse.redirect(
      appUrl(request, `/onboarding?connectionError=oauth_callback_failed&service=${integration.id}`),
    );
  }

  return NextResponse.redirect(appUrl(request, `/integrations/${integration.id}/resources?connected=1`));
}
