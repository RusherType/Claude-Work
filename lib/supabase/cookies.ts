import type { CookieOptionsWithName } from "@supabase/ssr";

// Session cookies are HTTP-only (docs/03-security.md): page scripts can never read the refresh
// token. Secure everywhere except local http development.
export const AUTH_COOKIE_OPTIONS: CookieOptionsWithName = {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};
