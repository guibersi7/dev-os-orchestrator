import type { NextRequest } from "next/server";
import { updateAuthSession } from "@/lib/auth/middleware";

export function proxy(request: NextRequest) {
  return updateAuthSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg|icon-|og.svg|manifest.webmanifest).*)"],
};
