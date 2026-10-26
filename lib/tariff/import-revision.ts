import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { buildChapterLines, chapterOffset, type UsitcRow } from "./hts-import";
import type { Release } from "./usitc";

/** A full US schedule has ~30,000 lines; fewer than this means a partial or broken fetch. */
export const MIN_US_LINES = 20_000;
const BATCH = 500;

/** Creates the revision row, or returns the existing one for the same release (idempotent). */
export async function startRevision(db: AdminClient, release: Release) {
  const { data, error } = await db
    .from("tariff_revisions")
    .upsert(
      {
        market: "US",
        label: release.name,
        effective_from: release.effectiveFrom,
        source_url: release.sourceUrl,
      },
      { onConflict: "market,label", ignoreDuplicates: false },
    )
    .select("id, status")
    .single();
  if (error) throw error;
  return data;
}

/** Writes one chapter. Re-running it rewrites the same positions, so retries are safe. */
export async function importChapter(
  db: AdminClient,
  revisionId: string,
  chapter: string,
  rows: UsitcRow[],
) {
  const lines = buildChapterLines(rows, chapterOffset(chapter));
  for (let i = 0; i < lines.length; i += BATCH) {
    const batch = lines.slice(i, i + BATCH).map((line) => ({
      ...line,
      revision_id: revisionId,
      rate: line.rate as unknown as Json,
      footnotes: line.footnotes as unknown as Json,
    }));
    const { error } = await db
      .from("tariff_lines")
      .upsert(batch, { onConflict: "revision_id,position" });
    if (error) throw error;
  }
  // Drop rows a previous attempt wrote beyond this chapter's current length
  const { error } = await db
    .from("tariff_lines")
    .delete()
    .eq("revision_id", revisionId)
    .gte("position", chapterOffset(chapter) + lines.length)
    .lt("position", chapterOffset(chapter) + 100_000);
  if (error) throw error;
  return {
    chapter,
    lines: lines.length,
    leaves: lines.filter((l) => l.is_leaf).length,
  };
}

/** Marks the revision complete once the line count is plausible; otherwise marks it failed. */
export async function finishRevision(
  db: AdminClient,
  revisionId: string,
  minLines = MIN_US_LINES,
) {
  const { count, error } = await db
    .from("tariff_lines")
    .select("id", { count: "exact", head: true })
    .eq("revision_id", revisionId);
  if (error) throw error;
  const complete = (count ?? 0) >= minLines;
  const { error: updateError } = await db
    .from("tariff_revisions")
    .update({
      status: complete ? "complete" : "failed",
      line_count: count,
      completed_at: complete ? new Date().toISOString() : null,
    })
    .eq("id", revisionId);
  if (updateError) throw updateError;
  if (!complete)
    throw new Error(
      `Revision has only ${count} lines (expected at least ${minLines})`,
    );
  return { lines: count };
}
