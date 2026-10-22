/**
 * Only same-site relative paths are allowed as a post-sign-in destination, so a crafted
 * `?next=` cannot send the user to another site (open redirect).
 */
export function safeNextPath(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
