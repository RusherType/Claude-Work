import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComputedQuote } from "@/lib/landed-cost/quote";
import { figuresDigest } from "@/lib/landed-cost/stored";

// CD-051: the save and search actions with their surroundings mocked (session, pricing, the
// database call, navigation). The point: a quote is saved only when the server's figures are
// the ones the person was shown, and failures are reported as failures.

const WS = "11111111-1111-4111-8111-111111111111";
const P1 = "6f1c1f43-3d8f-4f0c-9a59-0a3c8d0f4b11";

const mocks = vi.hoisted(() => ({
  computeQuote: vi.fn(),
  getWorkspaceContext: vi.fn(),
  rpc: vi.fn(),
  search: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
}));

vi.mock("@/lib/landed-cost/quote", () => ({
  computeQuote: mocks.computeQuote,
}));
vi.mock("@/lib/workspace", () => ({
  getWorkspaceContext: mocks.getWorkspaceContext,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    from: () => {
      const b: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown) => resolve(mocks.search()),
      };
      for (const op of ["select", "eq", "order", "limit", "or"])
        b[op] = () => b;
      return b;
    },
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { saveQuote, searchProducts } = await import("./actions");

const input = {
  lines: [{ productId: P1, quantity: 100, unitValue: "4.20" }],
  origin: "CN",
  mode: "express" as const,
  entryDate: "2026-11-01",
  currency: "USD",
  fxRateToUsd: "1",
  carrier: null,
};

function priced(landedCost: string, confirmed = true): ComputedQuote {
  const line = {
    id: P1,
    status: "ok" as const,
    customsValueUsd: "420.00",
    components: [],
    dutyTotal: "100.80",
    allocatedFees: "2.69",
    landedCost,
    warnings: [],
  };
  return {
    ok: true,
    input,
    revisionId: null,
    notices: [],
    result: {
      status: "ok",
      entryType: "informal",
      lines: [line],
      shipmentFees: [],
      totals: {
        customsValue: "420.00",
        duties: "100.80",
        fees: "2.69",
        landedCost,
      },
      warnings: [],
    },
    lines: [
      {
        productId: P1,
        title: "Crew T-shirt",
        sku: "TEE-1",
        code: "6109100012",
        confirmed,
        quantity: 100,
        unitValue: "4.20",
        result: line,
      },
    ],
  };
}

function form(shown: string, name = "November order") {
  const f = new FormData();
  f.set("name", name);
  f.set("shown", shown);
  f.set(
    "payload",
    JSON.stringify({ ...input, carrier: "", lines: input.lines }),
  );
  return f;
}
const digest = (q: ComputedQuote) => figuresDigest(q.result, q.lines);
const session = (role: string) =>
  mocks.getWorkspaceContext.mockResolvedValue({
    user: { id: "u1", email: null },
    workspace: { id: WS, name: "Acme", role },
    workspaces: [],
  });

beforeEach(() => {
  vi.clearAllMocks();
  session("member");
  mocks.rpc.mockResolvedValue({ data: "new-quote-id", error: null });
});

describe("saveQuote", () => {
  it("saves what the server priced when it matches what was shown", async () => {
    const q = priced("523.49");
    mocks.computeQuote.mockResolvedValue(q);
    await expect(
      saveQuote({ status: "idle" }, form(digest(q))),
    ).rejects.toThrow("REDIRECT /app/landed-cost/quotes/new-quote-id?saved=1");
    expect(mocks.rpc).toHaveBeenCalledOnce();
    const [name, args] = mocks.rpc.mock.calls[0];
    expect(name).toBe("save_quote");
    expect(args).toMatchObject({
      p_workspace: WS,
      p_quote: {
        name: "November order",
        status: "ok",
        entry_date: "2026-11-01",
      },
      p_lines: [{ code_used: "6109100012", used_suggested: false }],
    });
  });

  it.each([
    ["a different total", priced("530.00")],
    ["a code that is no longer confirmed", priced("523.49", false)],
  ])(
    "refuses, and saves nothing, when the server now finds %s",
    async (_, now) => {
      mocks.computeQuote.mockResolvedValue(now);
      const state = await saveQuote(
        { status: "idle" },
        form(digest(priced("523.49"))),
      );
      expect(state).toMatchObject({
        status: "error",
        message: expect.stringMatching(/Calculate again, then save/),
      });
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it("refuses viewers before pricing or saving anything", async () => {
    session("viewer");
    const state = await saveQuote({ status: "idle" }, form("x"));
    expect(state).toMatchObject({
      status: "error",
      message: expect.stringMatching(/Viewers can't save quotes/),
    });
    expect(mocks.computeQuote).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("asks for a name, and to calculate again when only the hidden digest is missing", async () => {
    const noName = await saveQuote({ status: "idle" }, form("x", " "));
    expect(noName).toMatchObject({
      status: "error",
      message: "Fix the highlighted fields.",
      errors: { name: expect.any(String) },
    });
    const noDigest = await saveQuote({ status: "idle" }, form(""));
    expect(noDigest).toMatchObject({
      status: "error",
      message: "Calculate again, then save.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "P0001", message: "too_many_quotes" }, /in the last hour/],
    [{ code: "P0001", message: "quote_limit" }, /limit of 2,000/],
    [{ code: "42501", message: "not_allowed" }, /can't save quotes/],
    [{ code: "23514", message: "check" }, /problem on our side/],
  ])("explains a refusal from the database (%j)", async (error, message) => {
    const q = priced("523.49");
    mocks.computeQuote.mockResolvedValue(q);
    mocks.rpc.mockResolvedValue({ data: null, error });
    const state = await saveQuote({ status: "idle" }, form(digest(q)));
    expect(state).toMatchObject({
      status: "error",
      message: expect.stringMatching(message),
    });
  });
});

describe("searchProducts", () => {
  it("returns the matches", async () => {
    mocks.search.mockReturnValue({
      data: [
        {
          id: P1,
          title: "Crew T-shirt",
          sku: "TEE-1",
          code: "6109100012",
          status: "confirmed",
          customs_value: "4.20",
          currency: "USD",
          origin_country: "CN",
        },
      ],
      error: null,
    });
    expect(await searchProducts("tee")).toEqual({
      ok: true,
      hits: [expect.objectContaining({ id: P1, customsValue: "4.20" })],
    });
  });

  it("reports a failed search as a failure, not as no matches", async () => {
    mocks.search.mockReturnValue({ data: null, error: { message: "boom" } });
    expect(await searchProducts("tee")).toEqual({
      ok: false,
      message: "Couldn't search your catalog. Try again.",
    });
    mocks.getWorkspaceContext.mockResolvedValue(null);
    expect(await searchProducts("tee")).toEqual({
      ok: false,
      message: "Your session has ended. Sign in again.",
    });
    expect(await searchProducts("x".repeat(101))).toMatchObject({ ok: false });
  });
});
