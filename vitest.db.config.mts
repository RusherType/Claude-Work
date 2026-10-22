import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Database tests (RLS, tenant isolation) against the local Supabase stack: `pnpm test:db`.
// Locally the keys come from .env.local; CI passes them as environment variables.
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local
}

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
