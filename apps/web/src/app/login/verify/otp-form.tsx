"use client";

import { useActionState, useState } from "react";
import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from "input-otp";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type AuthActionState, verifyEmailOtpAction } from "@/app/login/actions";

const initialState: AuthActionState = {};

function OtpSlot({ char, isActive, hasFakeCaret }: SlotProps) {
  return (
    <div
      className={cn(
        "relative flex h-12 w-10 items-center justify-center rounded-md border border-input bg-[#0B0F1A] text-lg font-semibold transition-all",
        isActive && "border-ring ring-3 ring-ring/50",
      )}
    >
      {char}
      {hasFakeCaret ? <span className="h-5 w-px animate-dos-pulse bg-foreground" /> : null}
    </div>
  );
}

export function OtpForm({ email, redirectTo, mode }: { email: string; redirectTo: string; mode: "login" | "signup" }) {
  const [otp, setOtp] = useState("");
  const [state, action, pending] = useActionState(verifyEmailOtpAction, initialState);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="redirect" value={redirectTo} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="otp" value={otp} />
      <OTPInput
        value={otp}
        onChange={setOtp}
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        containerClassName="flex justify-center gap-2"
        render={({ slots }) => (
          <>
            {slots.map((slot, index) => (
              <OtpSlot key={index} {...slot} />
            ))}
          </>
        )}
      />
      <Button type="submit" className="h-11 w-full" disabled={pending || otp.length < 6}>
        Verify code
        <ArrowRight className="h-4 w-4" />
      </Button>
      {state.error ? <p className="text-sm text-[#FF9CAF]">{state.error}</p> : null}
    </form>
  );
}
