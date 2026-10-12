import { describe, expect, it } from "vitest";
import { CsvError, csvCell, parseCsv, toCsv } from "./csv";

describe("parseCsv", () => {
  it("reads simple rows with LF or CRLF", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseCsv("a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseCsv("a\r1\r")).toEqual([["a"], ["1"]]);
  });

  it("keeps empty cells and skips blank lines", () => {
    expect(parseCsv("a,,c\n\n,,\n")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });

  it("reads quoted cells with commas, quotes and line breaks", () => {
    expect(parseCsv('"a,b","say ""hi""","two\nlines"\nx,y,z')).toEqual([
      ["a,b", 'say "hi"', "two\nlines"],
      ["x", "y", "z"],
    ]);
    expect(parseCsv('"",""')).toEqual([["", ""]]);
  });

  it("strips a byte-order mark", () => {
    expect(parseCsv("﻿sku,title\n")).toEqual([["sku", "title"]]);
  });

  it("keeps a quote inside an unquoted cell as text", () => {
    expect(parseCsv('5" screen,x')).toEqual([['5" screen', "x"]]);
  });

  it("rejects an unclosed quote with its line number", () => {
    try {
      parseCsv('a\n"open,\nmore');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CsvError);
      expect((e as CsvError).line).toBe(2);
    }
  });

  it("rejects text after a closing quote", () => {
    expect(() => parseCsv('"abc"x,1')).toThrow(/after a closing quote/);
  });

  it("is fast on a large file", () => {
    const row = '"SKU-1","Cotton T-shirt, crew neck","100% cotton",CN,12.50\n';
    const text = row.repeat(20000);
    const start = performance.now();
    expect(parseCsv(text)).toHaveLength(20000);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe("csv output", () => {
  it("quotes only when needed and round-trips", () => {
    const rows = [
      ["a", "b,c", 'd"e', "f\ng"],
      ["", "plain", "", ""],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@x")).toBe("'@x");
  });
});
