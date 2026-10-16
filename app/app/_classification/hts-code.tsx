"use client";

import { useState } from "react";
import { formatHtsCode } from "@/lib/catalog/listing";

/** HTS code as 6109.10.0012 in mono, with a copy button (docs/04-frontend.md). */
export function HtsCode({
  code,
  className = "text-xs",
}: {
  code: string | null;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!code) return <span className={`font-mono ${className}`}>—</span>;
  const text = formatHtsCode(code);
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`font-mono ${className}`}>{text}</span>
      <button
        type="button"
        className="text-brand text-xs underline"
        aria-label={`Copy HTS code ${text}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Clipboard blocked: the code stays visible to copy by hand.
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
