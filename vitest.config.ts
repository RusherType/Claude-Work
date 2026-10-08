import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const shared = {
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // server-only throws outside the react-server condition; unit tests run server code directly.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
};

export default defineConfig({
  ...shared,
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: "unit",
          environment: "node",
          include: ["**/*.test.{ts,tsx}"],
          exclude: [
            "node_modules/**",
            ".next/**",
            "tests/e2e/**",
            "tests/db/**",
          ],
        },
      },
      {
        ...shared,
        test: {
          // Live database suites share one database and take table locks: run files one by one.
          name: "db",
          environment: "node",
          include: ["tests/db/**/*.test.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
