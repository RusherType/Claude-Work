"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Review queue keys (docs/04-frontend.md screen 7): A confirm, E edit, Q answer, J next,
 * K previous. Ignored while typing, with a modifier key, on key repeat, or with a dialog open.
 */
export function ReviewShortcuts({
  prevHref,
  nextHref,
  editHref,
}: {
  prevHref: string | null;
  nextHref: string | null;
  editHref: string;
}) {
  const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))
      )
        return;
      if (document.querySelector("dialog[open]")) return;
      switch (e.key.toLowerCase()) {
        case "a": {
          const form = document.getElementById("confirm-form");
          if (form instanceof HTMLFormElement) {
            e.preventDefault();
            form.requestSubmit();
          }
          return;
        }
        case "e":
          e.preventDefault();
          router.push(editHref);
          return;
        case "q": {
          const first = document.querySelector<HTMLElement>(
            "[data-question-first]",
          );
          if (first) {
            e.preventDefault();
            first.focus();
          }
          return;
        }
        case "j":
          if (nextHref) {
            e.preventDefault();
            router.push(nextHref);
          }
          return;
        case "k":
          if (prevHref) {
            e.preventDefault();
            router.push(prevHref);
          }
          return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prevHref, nextHref, editHref]);
  return null;
}
