/**
 * Runs the HTS import without Inngest: `pnpm hts:import` (all chapters) or
 * `pnpm hts:import 61 62` (some chapters; the revision stays "importing").
 * Uses the same code as the Inngest function. Local database only unless you
 * point the env vars elsewhere.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { CHAPTERS } from "@/lib/tariff/hts-import";
import {
  finishRevision,
  importChapter,
  startRevision,
} from "@/lib/tariff/import-revision";
import { fetchChapter, fetchCurrentRelease } from "@/lib/tariff/usitc";

try {
  process.loadEnvFile(".env.local");
} catch {
  // env comes from the shell
}

async function main() {
  const only = process.argv.slice(2).map((c) => c.padStart(2, "0"));
  const chapters = only.length ? only : CHAPTERS;
  const db = createAdminClient();

  const release = await fetchCurrentRelease();
  const revision = await startRevision(db, release);
  console.log(
    `${release.title} (${release.name}), effective ${release.effectiveFrom} → revision ${revision.id}`,
  );

  for (const chapter of chapters) {
    const result = await importChapter(
      db,
      revision.id,
      chapter,
      await fetchChapter(chapter),
    );
    console.log(
      `chapter ${chapter}: ${result.lines} lines, ${result.leaves} leaves`,
    );
  }

  if (!only.length) console.log(await finishRevision(db, revision.id));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
