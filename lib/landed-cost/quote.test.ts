import { describe, expect, it, vi } from "vitest";
import { COLUMN2_SYMBOL } from "./engine-input";
import { computeQuote } from "./quote";
import type { QuoteInput } from "./schema";

// CD-051: computeQuote against a recording stand-in for the Supabase client. It checks which
// rows are asked for (workspace scope, published only, the entry date) and what comes back for
// each kind of missing or bad data. The real queries run in the Playwright flow.

const WS = "11111111-1111-4111-8111-111111111111";
const P1 = "6f1c1f43-3d8f-4f0c-9a59-0a3c8d0f4b11";
const REV = "00000000-0000-4000-8000-0000000000aa";

type Filter = [op: string, ...args: unknown[]];
type Tables = Record<string, unknown[] | { error: true }>;

function fakeSupabase(tables: Tables, revision: string | null = REV) {
  const calls: { table: string; filters: Filter[] }[] = [];
  const rpcs: { name: string; args: unknown }[] = [];
  const client = {
    from(table: string) {
      const call = { table, filters: [] as Filter[] };
      calls.push(call);
      const result = () => {
        const t = tables[table] ?? [];
        return Array.isArray(t)
          ? { data: t, error: null }
          : { data: null, error: { message: "boom" } };
      };
      const builder: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown) => resolve(result()),
      };
      for (const op of ["select", "eq", "in", "contains", "lte", "or"])
        builder[op] = (...args: unknown[]) => {
          call.filters.push([op, ...args]);
          return builder;
        };
      return builder;
    },
    rpc(name: string, args: unknown) {
      rpcs.push({ name, args });
      return Promise.resolve({ data: revision, error: null });
    },
  };
  const filtersOn = (table: string) =>
    calls.filter((c) => c.table === table).flatMap((c) => c.filters);
  return { client: client as never, filtersOn, rpcs };
}

const input: QuoteInput = {
  lines: [{ productId: P1, quantity: 100, unitValue: "4.20" }],
  origin: "CN",
  mode: "express",
  entryDate: "2026-11-01",
  currency: "USD",
  fxRateToUsd: "1",
  carrier: null,
};

const row = {
  effective_from: "2026-01-01",
  effective_to: null,
  source_url: "https://example.test/source",
};
const tables = (over: Tables = {}): Tables => ({
  products: [{ id: P1, title: "Crew T-shirt", sku: "TEE-1", weight_kg: null }],
  catalog_items: [{ id: P1, code: "6109100012", status: "confirmed" }],
  tariff_lines: [
    {
      code: "6109100012",
      general_rate_raw: "16.5%",
      special_rate_raw: null,
      column2_rate_raw: "90%",
    },
  ],
  tariff_measures: [
    {
      ...row,
      id: "m1",
      authority: "Section 301",
      ch99_code: "9903.88.15",
      hts_prefixes: ["6109"],
      excluded_prefixes: [],
      origin_countries: ["CN"],
      rate_type: "ad_valorem",
      rate_value: "7.5",
      applies_to_modes: ["express"],
      exempt_programs: [],
    },
  ],
  fee_schedules: [
    {
      ...row,
      id: "limit",
      fee_type: "informal_entry_limit",
      mode: null,
      carrier: null,
      pct: null,
      flat_amount: "2500.00",
      min_amount: null,
      max_amount: null,
    },
    {
      ...row,
      id: "mpf",
      fee_type: "mpf_informal",
      mode: null,
      carrier: null,
      pct: null,
      flat_amount: "2.69",
      min_amount: null,
      max_amount: null,
    },
  ],
  special_programs: [
    {
      ...row,
      symbol: COLUMN2_SYMBOL,
      countries: ["CU", "KP"],
      mpf_exempt: false,
    },
  ],
  ...over,
});

describe("computeQuote", () => {
  it("prices a confirmed product from the data on file", async () => {
    const { client } = fakeSupabase(tables());
    const q = await computeQuote(client, WS, input);
    expect(q).toMatchObject({
      ok: true,
      revisionId: REV,
      notices: [],
      result: {
        status: "ok",
        totals: { customsValue: "420.00", landedCost: "523.49" },
      },
      lines: [{ title: "Crew T-shirt", code: "6109100012", confirmed: true }],
    });
  });

  it("asks only for the workspace's products and for published rows in force on the entry date", async () => {
    const { client, filtersOn, rpcs } = fakeSupabase(tables());
    await computeQuote(client, WS, input);
    for (const table of ["products", "catalog_items"])
      expect(filtersOn(table)).toContainEqual(["eq", "workspace_id", WS]);
    for (const table of [
      "tariff_measures",
      "fee_schedules",
      "special_programs",
    ])
      expect(filtersOn(table)).toContainEqual(["eq", "published", true]);
    for (const table of ["tariff_measures", "fee_schedules"]) {
      expect(filtersOn(table)).toContainEqual([
        "lte",
        "effective_from",
        "2026-11-01",
      ]);
      expect(filtersOn(table)).toContainEqual([
        "or",
        "effective_to.is.null,effective_to.gte.2026-11-01",
      ]);
    }
    // Base rates come from the revision in force on the entry date, not today's.
    expect(rpcs).toEqual([
      { name: "revision_on", args: { p_market: "US", p_date: "2026-11-01" } },
    ]);
    expect(filtersOn("tariff_lines")).toContainEqual([
      "eq",
      "revision_id",
      REV,
    ]);
    expect(filtersOn("tariff_lines")).toContainEqual(["eq", "is_leaf", true]);
    // No `select *`: author columns are not granted.
    for (const table of [
      "tariff_measures",
      "fee_schedules",
      "special_programs",
    ])
      expect(String(filtersOn(table)[0][1])).not.toContain("*");
  });

  it("marks a suggested code and carries the engine's warning", async () => {
    const { client } = fakeSupabase(
      tables({
        catalog_items: [{ id: P1, code: "6109100012", status: "suggested" }],
      }),
    );
    const q = await computeQuote(client, WS, input);
    if (!q.ok) throw new Error(q.message);
    expect(q.lines[0].confirmed).toBe(false);
    expect(q.lines[0].result.warnings.join(" ")).toMatch(/suggested code/);
  });

  it("needs review when no Column 2 list is published", async () => {
    const { client } = fakeSupabase(tables({ special_programs: [] }));
    const q = await computeQuote(client, WS, input);
    if (!q.ok) throw new Error(q.message);
    expect(q.result.status).toBe("needs_review");
    expect(q.notices.join(" ")).toMatch(/Column 2 countries is not published/);
  });

  it("uses the Column 2 rate for a listed origin", async () => {
    const { client } = fakeSupabase(tables());
    const q = await computeQuote(client, WS, { ...input, origin: "CU" });
    if (!q.ok) throw new Error(q.message);
    expect(q.lines[0].result.components[0]).toMatchObject({
      kind: "duty_column2",
      amount: "378.00",
    });
  });

  it("needs review, with a notice, when no tariff schedule covers the date", async () => {
    const { client, filtersOn } = fakeSupabase(tables(), null);
    const q = await computeQuote(client, WS, input);
    if (!q.ok) throw new Error(q.message);
    expect(q.revisionId).toBeNull();
    expect(q.result.status).toBe("needs_review");
    expect(q.notices.join(" ")).toMatch(/No US tariff schedule on file covers/);
    expect(filtersOn("tariff_lines")).toEqual([]);
  });

  it("needs review when the code is not in that schedule", async () => {
    const { client } = fakeSupabase(tables({ tariff_lines: [] }));
    const q = await computeQuote(client, WS, input);
    if (!q.ok) throw new Error(q.message);
    expect(q.lines[0].result.status).toBe("needs_review");
  });

  it.each([
    [{ products: [] }, /no longer in your catalog/],
    [{ catalog_items: [] }, /no 10-digit tariff code yet/],
    [
      { catalog_items: [{ id: P1, code: null, status: "queued" }] },
      /no 10-digit tariff code yet/,
    ],
    [
      { catalog_items: [{ id: P1, code: "61091000", status: "suggested" }] },
      /no 10-digit tariff code yet/,
    ],
    [{ fee_schedules: { error: true as const } }, /Couldn't load/],
    [{ tariff_lines: { error: true as const } }, /Couldn't load/],
  ] as [Tables, RegExp][])("refuses %j", async (over, message) => {
    const { client } = fakeSupabase(tables(over));
    const q = await computeQuote(client, WS, input);
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.message).toMatch(message);
  });

  it("reports malformed reference data without leaking it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = tables();
    (bad.fee_schedules as Record<string, unknown>[])[1].flat_amount = "abc";
    const { client } = fakeSupabase(bad);
    const q = await computeQuote(client, WS, input);
    expect(q).toEqual({
      ok: false,
      message: expect.stringMatching(/malformed, so it can't be priced/),
    });
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
