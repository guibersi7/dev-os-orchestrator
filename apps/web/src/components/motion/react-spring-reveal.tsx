"use client";

import * as React from "react";
import { animated, useSpring } from "@react-spring/web";
import { cn } from "@/lib/utils";

type SpringRevealProps = React.ComponentProps<"div"> & {
  delay?: number;
};

export function SpringReveal({ className, delay = 0, children, ...props }: SpringRevealProps) {
  const styles = useSpring({
    from: { opacity: 0, y: 14 },
    to: { opacity: 1, y: 0 },
    delay,
    config: { tension: 220, friction: 24 },
  });

  return (
    <animated.div style={styles} className={cn(className)} {...props}>
      {children}
    </animated.div>
  );
}
