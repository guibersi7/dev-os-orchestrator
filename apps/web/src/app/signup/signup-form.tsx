"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, MailPlus } from "lucide-react";
import { signUpWithEmailOtpAction, type AuthActionState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AuthActionState = {};

function getActionErrorMessage(state: AuthActionState) {
  if (typeof state.error === "string" && state.error.trim()) {
    return state.error;
  }

  return null;
}

export function SignupForm({ email, redirectTo, isAuthConfigured }: { email: string; redirectTo: string; isAuthConfigured: boolean }) {
  const [state, action, pending] = useActionState(signUpWithEmailOtpAction, initialState);
  const errorMessage = getActionErrorMessage(state);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="redirect" value={redirectTo} />
      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="email">
          Email
        </label>
        <Input id="email" name="email" type="email" autoComplete="email" defaultValue={email} required />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="fullName">
          Full name
        </label>
        <Input id="fullName" name="fullName" autoComplete="name" placeholder="Your full name" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="phone">
            Phone
          </label>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+55 11 99999-9999" required />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="birthDate">
            Birth date
          </label>
          <Input id="birthDate" name="birthDate" type="date" autoComplete="bday" required />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="profession">
            Profession
          </label>
          <Input id="profession" name="profession" autoComplete="organization-title" placeholder="Product manager" required />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="company">
            Company
          </label>
          <Input id="company" name="company" autoComplete="organization" placeholder="Company name" required />
        </div>
      </div>
      <Button type="submit" className="h-11 w-full" disabled={pending || !isAuthConfigured}>
        <MailPlus className="h-4 w-4" />
        Create account
        <ArrowRight className="h-4 w-4" />
      </Button>
      {!isAuthConfigured ? <p className="text-sm text-[#FF9CAF]">Supabase Auth is not configured for this deployment.</p> : null}
      {errorMessage ? <p className="text-sm text-[#FF9CAF]">{errorMessage}</p> : null}
      <Link href={`/login?redirect=${encodeURIComponent(redirectTo)}`} className="block text-center text-sm text-[var(--standup-accent-text)]">
        Already have an account?
      </Link>
    </form>
  );
}
