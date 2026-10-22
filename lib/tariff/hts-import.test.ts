import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/usitc-6109.json";
import {
  CHAPTERS,
  buildChapterLines,
  chapterOffset,
  usitcRowSchema,
} from "./hts-import";

// Real USITC export for headings 6109–6110 (reststop/exportList, Revision 21 2026)
const rows = fixture.map((r) => usitcRowSchema.parse(r));
const lines = buildChapterLines(rows, chapterOffset("61"));
const byCode = (code: string) => lines.find((l) => l.code === code)!;

describe("buildChapterLines on real USITC data", () => {
  it("keeps every row, in order, with schedule positions", () => {
    expect(lines).toHaveLength(rows.length);
    expect(lines[0].position).toBe(6_100_000);
    expect(lines.at(-1)!.position).toBe(6_100_000 + rows.length - 1);
  });

  it("stores codes digits-only and keeps codeless grouping rows", () => {
    expect(byCode("6109100004").indent).toBe(3);
    const grouping = lines[2];
    expect(grouping.code).toBe("");
    expect(grouping.description).toBe("Men's or boys':");
    expect(grouping.is_leaf).toBe(false);
  });

  it("parses the rates on the 8-digit line", () => {
    const line = byCode("61091000");
    expect(line.general_rate_raw).toBe("16.5%");
    expect(line.rate?.general).toEqual({
      kind: "rate",
      components: [{ type: "ad_valorem", percent: "16.5" }],
    });
    expect(line.rate?.column2).toEqual({
      kind: "rate",
      components: [{ type: "ad_valorem", percent: "90" }],
    });
    expect(line.rate?.special[0].programs).toContain("KR");
    expect(line.rate?.inherited_from).toBeNull();
  });

  it("10-digit statistical lines inherit the 8-digit rate and say so", () => {
    const line = byCode("6109100012");
    expect(line.general_rate_raw).toBeNull();
    expect(line.rate?.general).toEqual(byCode("61091000").rate?.general);
    expect(line.rate?.inherited_from).toBe("61091000");
  });

  it("marks leaves: statistical lines yes, their parents no", () => {
    expect(byCode("6109100012").is_leaf).toBe(true);
    expect(byCode("61091000").is_leaf).toBe(false);
    expect(byCode("6109").is_leaf).toBe(false);
  });

  it("builds a readable full path through grouping rows", () => {
    expect(byCode("6109100012").full_path).toBe(
      "T-shirts, singlets, tank tops and similar garments, knitted or crocheted › Of cotton › Men's or boys' › Other T-shirts › Men's (338)",
    );
  });

  it("headings and 6-digit lines do not inherit a rate", () => {
    expect(byCode("6109").rate).toBeNull();
  });

  it("a heading at the end of the range is not a leaf", () => {
    expect(lines.at(-1)!.code).toBe("6110");
    expect(lines.at(-1)!.is_leaf).toBe(false);
  });

  it("every leaf in the sample has a rate (own or inherited)", () => {
    const leaves = lines.filter((l) => l.is_leaf);
    expect(leaves.length).toBeGreaterThan(20);
    expect(leaves.filter((l) => !l.rate).map((l) => l.code)).toEqual([]);
  });
});

describe("buildChapterLines edge cases", () => {
  const row = (htsno: string, indent: number, general = "") =>
    usitcRowSchema.parse({
      htsno,
      indent: String(indent),
      description: htsno || "Other:",
      general,
      units: [],
    });

  it("the last row of a chapter is a leaf", () => {
    const out = buildChapterLines(
      [row("0101", 0), row("0101.21.00", 1, "Free")],
      0,
    );
    expect(out[1].is_leaf).toBe(true);
  });

  it("indent jumps do not break inheritance", () => {
    const out = buildChapterLines(
      [row("0101.21.00", 0, "5%"), row("", 1), row("0101.21.00.10", 3)],
      0,
    );
    expect(out[2].rate?.inherited_from).toBe("01012100");
  });

  it("tolerates nulls in optional fields", () => {
    const parsed = usitcRowSchema.parse({
      htsno: null,
      indent: "2",
      description: null,
      units: null,
      footnotes: null,
    });
    expect(parsed).toMatchObject({
      htsno: "",
      description: "",
      units: [],
      footnotes: [],
    });
  });
});

describe("chapters", () => {
  it("lists 01 to 99 with non-overlapping offsets", () => {
    expect(CHAPTERS).toHaveLength(99);
    expect(CHAPTERS[0]).toBe("01");
    expect(chapterOffset("02") - chapterOffset("01")).toBeGreaterThan(50_000);
  });
});
