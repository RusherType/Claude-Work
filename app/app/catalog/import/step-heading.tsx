"use client";

import { useEffect, useRef } from "react";

/** "Step n of 3" heading that takes focus when its step appears, so keyboard and screen reader
 * users are not left on <body> after the previous step's button disappears. */
export function StepHeading({
  step,
  title,
  focus,
}: {
  step: 1 | 2 | 3;
  title: string;
  focus: boolean;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  return (
    <h2
      ref={ref}
      tabIndex={-1}
      className="text-base font-semibold focus:outline-none"
    >
      <span className="text-muted block text-xs font-normal">
        Step {step} of 3
      </span>
      {title}
    </h2>
  );
}
