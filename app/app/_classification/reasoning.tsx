"use client";

import { useState } from "react";

/** The agent's reasoning, three lines until opened (docs/04-frontend.md ClassificationCard). */
export function Reasoning({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 180 || text.split("\n").length > 3;
  return (
    <div className="flex flex-col items-start gap-1">
      <p
        id="reasoning-text"
        className={`text-sm whitespace-pre-line ${open || !long ? "" : "line-clamp-3"}`}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          className="text-brand text-xs underline"
          aria-expanded={open}
          aria-controls="reasoning-text"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Show less" : "Show all reasoning"}
        </button>
      )}
    </div>
  );
}
