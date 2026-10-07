export const DEFAULT_AFTER_SIGN_IN = "/app";

/**
 * Where to send a user after sign-in. Only same-site paths are allowed, so a crafted
 * `?next=https://evil.example` or `//evil.example` link cannot turn sign-in into an open redirect.
 * The result always resolves to the current origin.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next) return DEFAULT_AFTER_SIGN_IN;
  // `next` arrives already decoded (searchParams / form data); decoding again would turn a
  // literal "%26" into "&".
  const path = next;
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.startsWith("/\\")
  ) {
    return DEFAULT_AFTER_SIGN_IN;
  }
  if (/[\u0000-\u001f\\]/.test(path)) return DEFAULT_AFTER_SIGN_IN;
  // Resolve against a dummy origin; anything that escapes it is rejected. Check the normalised
  // result too: "/.//evil.example" normalises to the protocol-relative "//evil.example".
  const url = new URL(path, "http://clearduty.invalid");
  if (url.origin !== "http://clearduty.invalid") return DEFAULT_AFTER_SIGN_IN;
  const out = `${url.pathname}${url.search}${url.hash}`;
  if (out.startsWith("//") || out.startsWith("/\\"))
    return DEFAULT_AFTER_SIGN_IN;
  return out;
}

/** Paths that require a signed-in user. */
export function isProtectedPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}
