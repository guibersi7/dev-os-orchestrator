import { NextResponse } from "next/server";
import { getIntegrationCatalogItem } from "@/features/integrations/catalog";
import { completeOAuthConnection } from "@/lib/api-client";
import { getPublicAppUrl } from "@/lib/app-url";

function callbackFailureUrl(request: Request, service: string, reason: string) {
  const url = getPublicAppUrl("/onboarding", request.url);
  url.searchParams.set("connectionError", "oauth_callback_failed");
  url.searchParams.set("service", service);
  url.searchParams.set("reason", reason);

  return url;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const integration = getIntegrationCatalogItem(id);

  if (!integration) {
    return NextResponse.redirect(getPublicAppUrl("/onboarding?connectionError=unknown_service", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  if (providerError || !code || !state) {
    console.error("integration_oauth_callback_failed", {
      service: integration.id,
      reason: providerError ? "provider_error" : "missing_callback_params",
      providerError,
      hasCode: Boolean(code),
      hasState: Boolean(state),
    });

    return NextResponse.redirect(
      callbackFailureUrl(request, integration.id, providerError ? "provider_error" : "missing_callback_params"),
    );
  }

  const callbackState = await completeOAuthConnection(integration.id, code, state);

  if (callbackState.error || callbackState.data?.status !== "connected") {
    console.error("integration_oauth_callback_failed", {
      service: integration.id,
      reason: "gateway_callback_failed",
      error: callbackState.error,
      status: callbackState.data?.status,
    });

    return NextResponse.redirect(callbackFailureUrl(request, integration.id, "gateway_callback_failed"));
  }

  return NextResponse.redirect(getPublicAppUrl(`/integrations/${integration.id}/resources?connected=1`, request.url));
}
