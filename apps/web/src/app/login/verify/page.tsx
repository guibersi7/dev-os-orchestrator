import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand/brand-mark";
import { Card } from "@/components/ui/card";
import { sanitizeAuthRedirect } from "@/lib/auth/config";
import { getCurrentUser } from "@/lib/auth/server";
import { OtpForm } from "@/app/login/verify/otp-form";

export default async function VerifyOtpPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; redirect?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = sanitizeAuthRedirect(params.redirect);
  const email = String(params.email ?? "").trim().toLowerCase();
  const mode = params.mode === "signup" ? "signup" : "login";
  const user = await getCurrentUser();

  if (user) {
    redirect(redirectTo);
  }

  if (!email) {
    redirect(`/login?redirect=${encodeURIComponent(redirectTo)}`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080C15] px-4 py-10 text-[#E9EDF7]">
      <div className="w-full max-w-[420px]">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <BrandMark />
          <span className="text-sm font-semibold">Standup</span>
        </Link>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Check your email</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Enter the {mode === "signup" ? "signup" : "login"} code</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            We sent an access code to <span className="font-medium text-foreground">{email}</span>.
          </p>
          <div className="mt-6">
            <OtpForm email={email} redirectTo={redirectTo} mode={mode} />
          </div>
          <Link href={`/login?redirect=${encodeURIComponent(redirectTo)}`} className="mt-5 block text-center text-sm text-[var(--standup-accent-text)]">
            Use another email
          </Link>
        </Card>
      </div>
    </main>
  );
}
