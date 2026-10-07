import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { safeNext } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

// Handles the return from a magic link (PKCE `code`, or `token_hash` + `type` if the email
// template uses it) and from Google OAuth, then sends the user on to a same-site `next` path.
const querySchema = z.object({
  code: z.string().min(1).max(512).optional(),
  token_hash: z.string().min(1).max(512).optional(),
  type: z
    .enum([
      "email",
      "magiclink",
      "signup",
      "invite",
      "recovery",
      "email_change",
    ])
    .optional(),
  next: z.string().max(2048).optional(),
});

export async function GET(request: NextRequest) {
  const failed = new URL("/sign-in?error=link", request.url);
  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return NextResponse.redirect(failed);

  const { code, token_hash, type, next } = parsed.data;
  const supabase = await createClient();
  if (!supabase) return NextResponse.redirect(failed);

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (token_hash && type) {
    ok = !(
      await supabase.auth.verifyOtp({ token_hash, type: type as EmailOtpType })
    ).error;
  }
  if (!ok) return NextResponse.redirect(failed);
  return NextResponse.redirect(new URL(safeNext(next), request.url));
}
