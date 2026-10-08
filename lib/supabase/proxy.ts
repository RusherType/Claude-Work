import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath, safeNext } from "@/lib/auth/redirect";
import { supabaseEnv } from "@/lib/env";
import { AUTH_COOKIE_OPTIONS } from "./cookies";

/**
 * Runs from proxy.ts on every page request: refreshes the Supabase session cookie, sends
 * signed-out visitors of /app to /sign-in, and sends signed-in visitors of /sign-in on to their
 * `next` page (default /app).
 * The /app layout checks the session again on the server, so this is not the only guard.
 */
export async function updateSession(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const env = supabaseEnv();
  let response = NextResponse.next({ request });

  let userId: string | null = null;
  if (env) {
    const supabase = createServerClient(env.url, env.publishableKey, {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    });
    // Nothing may run between createServerClient and getClaims (see @supabase/ssr docs).
    const { data } = await supabase.auth.getClaims();
    userId = data?.claims?.sub ?? null;
  }

  if (!userId && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return withCookies(NextResponse.redirect(url), response);
  }
  if (userId && pathname === "/sign-in") {
    // Already signed in: continue to the requested same-site page (e.g. an invitation).
    const url = new URL(
      safeNext(request.nextUrl.searchParams.get("next")),
      request.url,
    );
    return withCookies(NextResponse.redirect(url), response);
  }
  return response;
}

// Keep refreshed auth cookies (and their no-cache headers) when replacing the response.
function withCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((c) => target.cookies.set(c));
  for (const h of ["cache-control", "expires", "pragma"]) {
    const v = source.headers.get(h);
    if (v) target.headers.set(h, v);
  }
  return target;
}
