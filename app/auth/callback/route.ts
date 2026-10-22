import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

const query = z.object({
  code: z.string().min(1).max(512),
  next: z.string().max(2048).optional(),
});

/** Magic links and Google OAuth both land here with a PKCE code. */
export async function GET(request: NextRequest) {
  const parsed = query.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  const signInError = new URL("/sign-in?error=link", request.url);
  if (!parsed.success) return NextResponse.redirect(signInError);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(
    parsed.data.code,
  );
  if (error) return NextResponse.redirect(signInError);

  return NextResponse.redirect(
    new URL(safeNextPath(parsed.data.next), request.url),
  );
}
