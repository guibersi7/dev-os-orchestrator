export function getPublicAppUrl(path: string, fallbackUrl: string) {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  const baseUrl = configuredOrigin || fallbackUrl;

  return new URL(path, baseUrl);
}

export function getPublicAppUrlFromHeaders(path: string, headers: Headers) {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const protocol = headers.get("x-forwarded-proto") ?? "http";

  return getPublicAppUrl(path, `${protocol}://${host}`);
}
