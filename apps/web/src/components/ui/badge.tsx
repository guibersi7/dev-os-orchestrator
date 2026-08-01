import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium transition-colors", {
  variants: {
    variant: {
      default: "border-transparent bg-primary text-primary-foreground",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      outline: "border-border bg-background text-foreground",
      destructive: "border-transparent bg-destructive text-destructive-foreground",
    },
    tone: {
      neutral: "border-border bg-muted text-muted-foreground",
      green: "border-[#1D4D3A] bg-[#10251D] text-[#6EE7B7]",
      amber: "border-[#4A3A18] bg-[#241F14] text-[#F6C66A]",
      red: "border-[#4A2230] bg-[#22141C] text-[#FF9CAF]",
      blue: "border-[var(--standup-accent-border)] bg-brand-surface text-[var(--standup-accent-text)]",
    },
  },
  defaultVariants: {
    variant: "secondary",
    tone: "neutral",
  },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, tone, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant, tone }), className)} {...props} />;
}

export { badgeVariants };
