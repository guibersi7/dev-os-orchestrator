"use client";

import * as React from "react";
import { animate, stagger } from "animejs";
import { cn } from "@/lib/utils";

type AnimeStaggerProps = React.ComponentProps<"div"> & {
  itemSelector?: string;
};

export function AnimeStagger({ className, children, itemSelector = ":scope > *", ...props }: AnimeStaggerProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const items = root.querySelectorAll<HTMLElement>(itemSelector);

    if (items.length === 0) {
      return;
    }

    const animation = animate(items, {
      opacity: [0, 1],
      y: [10, 0],
      delay: stagger(45),
      duration: 520,
      ease: "outCubic",
    });

    return () => {
      animation.pause();
    };
  }, [itemSelector]);

  return (
    <div ref={rootRef} className={cn(className)} {...props}>
      {children}
    </div>
  );
}
