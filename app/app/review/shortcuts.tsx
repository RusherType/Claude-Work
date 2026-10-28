"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "cd_review_shortcuts";

const CHANGED = "cd-review-shortcuts";

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function saveEnabled(on: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked: the shortcuts stay on.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/**
 * Review queue keys (docs/04-frontend.md screen 7): A confirm, E edit, Q answer, J next,
 * K previous. Ignored while typing, with a modifier key, on key repeat, or with a dialog open.
 * Single-character shortcuts can be turned off (WCAG 2.1.4); the choice is kept per browser.
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
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => true);

  useEffect(() => {
    if (!enabled) return;
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
          // Not while a confirm is already on its way (the button is disabled then).
          if (
            form instanceof HTMLFormElement &&
            !form.querySelector("button[type=submit]:disabled")
          ) {
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
  }, [enabled, router, prevHref, nextHref, editHref]);

  return (
    <div className="text-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <label className="inline-flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => saveEnabled(e.target.checked)}
        />
        Keyboard shortcuts
      </label>
      {enabled && (
        <span className="hidden sm:inline">
          <kbd>A</kbd> confirm · <kbd>E</kbd> edit product · <kbd>Q</kbd> answer
          a question · <kbd>J</kbd> next · <kbd>K</kbd> previous
        </span>
      )}
    </div>
  );
}
