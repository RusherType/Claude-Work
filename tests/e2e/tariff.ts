import { withLocalDb } from "./db";

// Tariff reference data the e2e flows need until the HTS importer (CD-010) runs in CI: a small
// revision in force today, a ruling, a Section 301 overlay and express fees. Shared and
// idempotent (fixed ids, upserts): every spec and browser project seeds the same rows.

export const REVISION = "00000000-0000-4000-8000-0000000e2e01";
const MEASURE = "00000000-0000-4000-8000-0000000e2e11";
const LIMIT = "00000000-0000-4000-8000-0000000e2e21";
const MPF = "00000000-0000-4000-8000-0000000e2e22";

export async function seedTariff() {
  await withLocalDb(async (db) => {
    await db.query(
      `insert into public.tariff_revisions (id, market, label, effective_from)
       values ($1, 'US', 'e2e-review', current_date)
       on conflict (id) do update set effective_from = current_date`,
      [REVISION],
    );
    const lines: [string, number, string, boolean, string | null][] = [
      ["6109", 0, "T-shirts, singlets, tank tops, knitted", false, null],
      ["61091000", 1, "Of cotton", false, null],
      ["6109100012", 2, "Men's T-shirts, all white", true, "16.5%"],
      ["6109100040", 2, "Men's T-shirts, other", true, "16.5%"],
    ];
    for (const [code, indent, description, leaf, rate] of lines)
      await db.query(
        `insert into public.tariff_lines
           (revision_id, code, indent, description, is_leaf, general_rate_raw, column2_rate_raw)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (revision_id, code, indent, description)
         do update set general_rate_raw = excluded.general_rate_raw,
                       column2_rate_raw = excluded.column2_rate_raw`,
        [REVISION, code, indent, description, leaf, rate, rate ? "90%" : null],
      );
    await db.query(
      `insert into public.rulings (number, collection, ruling_date, subject, status, url)
       values ('N300100', 'NY', '2018-08-01', 'Tariff classification of a men''s cotton T-shirt',
               'active', 'https://rulings.cbp.gov/ruling/N300100')
       on conflict do nothing`,
    );
    // Published reference rows (inserted without a signed-in user, as jobs do).
    await db.query(
      `insert into public.tariff_measures (id, market, authority, ch99_code, hts_prefixes,
         origin_countries, rate_type, rate_value, effective_from, source_url, published, notes)
       values ($1, 'US', 'Section 301', '9903.88.15', '{6109}', '{CN}', 'ad_valorem', 7.5,
         '2026-01-02', 'https://ustr.gov/issue-areas/enforcement/section-301-investigations',
         true, 'e2e')
       on conflict (id) do nothing`,
      [MEASURE],
    );
    // Express rows: a mode row beats the generic rows the admin e2e flow publishes.
    await db.query(
      `insert into public.fee_schedules (id, market, fee_type, mode, flat_amount, effective_from,
         source_url, published, notes)
       values ($1, 'US', 'informal_entry_limit', 'express', 2500, '2026-01-02',
               'https://www.cbp.gov/trade/basic-import-export', true, 'e2e'),
              ($2, 'US', 'mpf_informal', 'express', 2.69, '2026-01-02',
               'https://www.cbp.gov/trade/basic-import-export', true, 'e2e')
       on conflict (id) do nothing`,
      [LIMIT, MPF],
    );
  });
}
