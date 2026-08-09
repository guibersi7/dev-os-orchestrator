import type { NextRequest } from "next/server";
import { updateAuthSession } from "@/lib/auth/middleware";

export function proxy(request: NextRequest) {
  return updateAuthSession(request);
}

export const config = {
  matcher: [
    "/chat/:path*",
    "/dashboard/:path*",
    "/integrations/:path*",
    "/issues/:path*",
    "/onboarding/:path*",
    "/pull-requests/:path*",
    "/repositories/:path*",
    "/settings/:path*",
    "/setup/:path*",
    "/today/:path*",
    "/timeline/:path*",
    "/weekly/:path*",
  ],
};
