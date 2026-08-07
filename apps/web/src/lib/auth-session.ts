import { getCurrentUser } from "@/lib/auth/server";

export type AuthUser = {
  name: string;
  email: string;
  avatarUrl?: string;
};

export type AuthSession =
  | {
      status: "authenticated";
      user: AuthUser;
    }
  | {
      status: "unauthenticated";
      user: null;
};

export async function getInitialAuthSession(): Promise<AuthSession> {
  const user = await getCurrentUser();

  if (!user) {
    return { status: "unauthenticated", user: null };
  }

  const metadata = user.user_metadata ?? {};
  const email = user.email ?? "";
  const name = String(metadata.full_name ?? metadata.name ?? email).trim();
  const avatarUrl = String(metadata.avatar_url ?? "").trim();

  return {
    status: "authenticated",
    user: {
      name: name || "Signed in",
      email,
      avatarUrl: avatarUrl || undefined,
    },
  };
}
