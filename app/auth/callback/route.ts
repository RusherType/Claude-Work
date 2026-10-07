import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { safeNext } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

// Return from a magic link or Google OAuth. Only the PKCE `code` flow is accepted: its verifier
// cookie ties the link to the browser that asked for it, so a link from someone else's inbox
// cannot sign this browser into their account (login CSRF).
const querySchema = z.object({
  code: z.string().min(1).max(512),
  next: z.string().max(2048).optional(),
});

export async function GET(request: NextRequest) {
  const failed = new URL("/sign-in?error=link", request.url);
  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return NextResponse.redirect(failed);

  const supabase = await createClient();
  if (!supabase) return NextResponse.redirect(failed);
  const { error } = await supabase.auth.exchangeCodeForSession(
    parsed.data.code,
  );
  if (error) return NextResponse.redirect(failed);

  const target = new URL(safeNext(parsed.data.next), request.url);
  if (target.origin !== request.nextUrl.origin)
    return NextResponse.redirect(new URL("/app", request.url));
  return NextResponse.redirect(target);
}
