"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendEmailOtpAction, signInWithGoogleAction, type AuthActionState } from "@/app/login/actions";

const initialState: AuthActionState = {};

function getActionErrorMessage(state: AuthActionState) {
  if (typeof state.error === "string" && state.error.trim()) {
    return state.error;
  }

  return null;
}

export function LoginForm({ redirectTo, isAuthConfigured }: { redirectTo: string; isAuthConfigured: boolean }) {
  const [googleState, googleAction, googlePending] = useActionState(signInWithGoogleAction, initialState);
  const [emailState, emailAction, emailPending] = useActionState(sendEmailOtpAction, initialState);
  const googleError = getActionErrorMessage(googleState);
  const emailError = getActionErrorMessage(emailState);

  return (
    <div className="space-y-4">
      <form action={googleAction}>
        <input type="hidden" name="redirect" value={redirectTo} />
        <Button type="submit" variant="outline" className="h-11 w-full" disabled={googlePending || !isAuthConfigured}>
          <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-white text-xs font-bold text-[#1A2130]">
            G
          </span>
          Continue with Google
        </Button>
        {googleError ? <p className="mt-2 text-sm text-[#FF9CAF]">{googleError}</p> : null}
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or email code</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={emailAction} className="space-y-3">
        <input type="hidden" name="redirect" value={redirectTo} />
        <label className="block text-sm font-medium" htmlFor="email">
          Email
        </label>
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required />
        <Button type="submit" className="h-11 w-full" disabled={emailPending || !isAuthConfigured}>
          <Mail className="h-4 w-4" />
          Send login code
          <ArrowRight className="h-4 w-4" />
        </Button>
        {!isAuthConfigured ? <p className="text-sm text-[#FF9CAF]">Supabase Auth is not configured for this deployment.</p> : null}
        {emailError ? <p className="text-sm text-[#FF9CAF]">{emailError}</p> : null}
      </form>
      <Link href={`/signup?redirect=${encodeURIComponent(redirectTo)}`} className="block text-center text-sm text-[var(--standup-accent-text)]">
        Create an account
      </Link>
    </div>
  );
}
