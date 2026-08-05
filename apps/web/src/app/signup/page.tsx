import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand/brand-mark";
import { Card } from "@/components/ui/card";
import { isSupabaseAuthConfigured, sanitizeAuthRedirect } from "@/lib/auth/config";
import { getCurrentUser } from "@/lib/auth/server";
import { SignupForm } from "@/app/signup/signup-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; redirect?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = sanitizeAuthRedirect(params.redirect);
  const email = String(params.email ?? "").trim().toLowerCase();
  const user = await getCurrentUser();

  if (user) {
    redirect(redirectTo);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080C15] px-4 py-10 text-[#E9EDF7]">
      <div className="w-full max-w-[520px]">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <BrandMark />
          <span className="text-sm font-semibold">Standup</span>
        </Link>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Create your account</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Register before signing in</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            We will send a 6-digit code to confirm your email and finish setup.
          </p>
          {!isSupabaseAuthConfigured() ? (
            <p className="mt-4 rounded-md border border-[#4A3A18] bg-[#241F14] p-3 text-sm text-[#F6C66A]">
              Supabase Auth is missing. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
            </p>
          ) : null}
          <div className="mt-6">
            <SignupForm email={email} redirectTo={redirectTo} />
          </div>
        </Card>
      </div>
    </main>
  );
}
