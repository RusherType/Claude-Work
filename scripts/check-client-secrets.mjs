// docs/03-security.md: the service-role key must never reach client code.
// Fails if a "use client" file mentions the key or imports the admin client,
// or if any public (NEXT_PUBLIC_) variable name mentions a secret.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib"];
const FORBIDDEN = [
  /SUPABASE_SERVICE_ROLE_KEY/,
  /service_role/i,
  /@\/lib\/supabase\/admin/,
  /SECRET_KEY/,
];
const PUBLIC_SECRET = /NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE_ROLE|PRIVATE)/;

function* files(dir) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) yield path;
  }
}

const problems = [];
for (const root of ROOTS) {
  for (const file of files(root)) {
    const text = readFileSync(file, "utf8");
    if (PUBLIC_SECRET.test(text))
      problems.push(`${file}: public env var named like a secret`);
    if (!/^\s*["']use client["']/m.test(text)) continue;
    for (const pattern of FORBIDDEN) {
      if (pattern.test(text))
        problems.push(`${file}: client file matches ${pattern}`);
    }
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("No server secrets referenced from client code.");
