import { z } from "zod";

// Public Supabase settings. Next inlines NEXT_PUBLIC_* only when read literally, so each variable
// is referenced by name. Returns null when unset so pages can show a clear "not configured" state.
const supabaseSchema = z.object({
  url: z.url(),
  publishableKey: z.string().min(20),
});

export type SupabaseEnv = z.infer<typeof supabaseSchema>;

export function supabaseEnv(): SupabaseEnv | null {
  const parsed = supabaseSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return parsed.success ? parsed.data : null;
}

/** Google sign-in is shown only once the OAuth client is set up in Supabase. */
export function googleAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true";
}

/** Public site URL for links in emails (e.g. https://app.clearduty.com). Optional in development. */
export function siteUrl(): string | null {
  const parsed = z.url().safeParse(process.env.NEXT_PUBLIC_SITE_URL);
  return parsed.success && /^https?:/.test(parsed.data)
    ? parsed.data.replace(/\/$/, "")
    : null;
}
