import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand/brand-mark";
import { Card } from "@/components/ui/card";
import { isSupabaseAuthConfigured, sanitizeAuthRedirect } from "@/lib/auth/config";
import { getCurrentUser } from "@/lib/auth/server";
import { LoginForm } from "@/app/login/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string; email?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = sanitizeAuthRedirect(params.redirect);
  const email = String(params.email ?? "").trim().toLowerCase();
  const user = await getCurrentUser();
  const isAuthConfigured = isSupabaseAuthConfigured();

  if (user) {
    redirect(redirectTo);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080C15] px-4 py-10 text-[#E9EDF7]">
      <div className="w-full max-w-[420px]">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <BrandMark />
          <span className="text-sm font-semibold">Standup</span>
        </Link>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sign in without a password</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Use Google or receive a one-time code by email. New emails must register first.
          </p>
          {params.error ? (
            <p className="mt-4 rounded-md border border-[#4A2230] bg-[#22141C] p-3 text-sm text-[#FF9CAF]">
              Unable to finish login. Try again.
            </p>
          ) : null}
          {params.notice === "signup_created" ? (
            <p className="mt-4 rounded-md border border-[#1E4A32] bg-[#132419] p-3 text-sm text-[#6BE59D]">
              Account created. Send a new login code to continue.
            </p>
          ) : null}
          {!isAuthConfigured ? (
            <p className="mt-4 rounded-md border border-[#4A3A18] bg-[#241F14] p-3 text-sm text-[#F6C66A]">
              Supabase Auth is missing. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
            </p>
          ) : null}
          <div className="mt-6">
            <LoginForm redirectTo={redirectTo} isAuthConfigured={isAuthConfigured} defaultEmail={email} />
          </div>
        </Card>
      </div>
    </main>
  );
}
