import { z } from "zod";

/** Public env vars — safe in the browser. Server-only secrets are read where they are used, in server-only modules. */
const schema = z.object({
  supabaseUrl: z.url(),
  supabaseAnonKey: z.string().min(1),
});

export const publicEnv = schema.parse({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
