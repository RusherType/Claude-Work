import { createAdminClient } from "@/lib/supabase/admin";
import { CHAPTERS } from "@/lib/tariff/hts-import";
import {
  finishRevision,
  importChapter,
  startRevision,
} from "@/lib/tariff/import-revision";
import { fetchChapter, fetchCurrentRelease } from "@/lib/tariff/usitc";
import { inngest } from "../client";

/**
 * CD-010: imports the current USITC release into a tariff revision, one durable step
 * per chapter. Safe to re-run: a complete revision is skipped unless `force` is set,
 * and every chapter step overwrites the same rows.
 */
export const htsImport = inngest.createFunction(
  {
    id: "hts-import",
    triggers: [{ event: "tariff/hts.import.requested" }],
    concurrency: { limit: 1 },
    retries: 3,
  },
  async ({ event, step }) => {
    const force = Boolean(
      (event.data as { force?: boolean } | undefined)?.force,
    );
    const release = await step.run("fetch-release", () =>
      fetchCurrentRelease(),
    );
    const revision = await step.run("start-revision", () =>
      startRevision(createAdminClient(), release),
    );
    if (revision.status === "complete" && !force) {
      return { release: release.name, skipped: "already imported" };
    }

    for (const chapter of CHAPTERS) {
      await step.run(`chapter-${chapter}`, async () =>
        importChapter(
          createAdminClient(),
          revision.id,
          chapter,
          await fetchChapter(chapter),
        ),
      );
    }

    const finished = await step.run("finish-revision", () =>
      finishRevision(createAdminClient(), revision.id),
    );
    return { release: release.name, revisionId: revision.id, ...finished };
  },
);
