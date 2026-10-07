import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPath } from "@/lib/auth/redirect";
import { supabaseEnv } from "@/lib/env";

/**
 * Runs from proxy.ts on every page request: refreshes the Supabase session cookie, sends
 * signed-out visitors of /app to /sign-in, and sends signed-in visitors of /sign-in to /app.
 * The /app layout checks the session again on the server, so this is not the only guard.
 */
export async function updateSession(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const env = supabaseEnv();
  let response = NextResponse.next({ request });

  let userId: string | null = null;
  if (env) {
    const supabase = createServerClient(env.url, env.publishableKey, {
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
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return withCookies(NextResponse.redirect(url), response);
  }
  return response;
}

// Keep refreshed auth cookies when replacing the response with a redirect.
function withCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((c) => target.cookies.set(c));
  return target;
}
