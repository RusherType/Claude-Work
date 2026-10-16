"use client";

import { useRef } from "react";
import type { Ruling } from "@/lib/classification/card";
import { secondary } from "@/lib/ui/styles";

const STATUS_WORDS: Record<string, string> = {
  active: "In force",
  modified: "Modified",
  revoked: "Revoked",
};

/** CBP rulings the code relies on, in a side drawer (native dialog: focus trap and Esc). */
export function RulingsDrawer({ rulings }: { rulings: Ruling[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  if (rulings.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className={secondary}
        onClick={() => dialog.current?.showModal()}
      >
        Rulings ({rulings.length})
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="rulings-title"
        className="bg-surface text-foreground border-border m-0 ml-auto h-full max-h-none w-full max-w-md border-l p-0 backdrop:bg-black/40"
        onClick={(e) => {
          // A click on the backdrop (the dialog element itself) closes it.
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 id="rulings-title" className="text-base font-semibold">
              Rulings cited
            </h2>
            <button
              type="button"
              className={secondary}
              onClick={() => dialog.current?.close()}
            >
              Close
            </button>
          </div>
          <p className="text-muted text-xs">
            CBP rulings on similar products. A ruling binds only the importer it
            was issued to; it shows how CBP has classified goods like yours.
          </p>
          <ul className="flex flex-col gap-3">
            {rulings.map((r) => (
              <li
                key={r.number}
                className="border-border flex flex-col gap-1 rounded-md border p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-medium">{r.number}</span>
                  {r.date && (
                    <span className="text-muted text-xs">{r.date}</span>
                  )}
                  <span
                    className={`text-xs ${r.status === "revoked" ? "text-risk" : "text-muted"}`}
                  >
                    {STATUS_WORDS[r.status] ?? "Status unknown"}
                  </span>
                </div>
                {r.subject && <p>{r.subject}</p>}
                {r.url && (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand text-xs underline"
                  >
                    Read ruling {r.number} (opens a new tab)
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}
