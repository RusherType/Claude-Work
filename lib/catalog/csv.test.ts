import { describe, expect, it } from "vitest";
import {
  CsvError,
  csvCell,
  decodeCsvFile,
  parseCsv,
  parseCsvRows,
  toCsv,
} from "./csv";

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

describe("parseCsvRows", () => {
  it("numbers rows by the line they start on", () => {
    expect(
      parseCsvRows('a,b\n\n"x\ny",z\r\nlast,1').map((r) => r.line),
    ).toEqual([1, 3, 5]);
  });
});

describe("decodeCsvFile", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);

  it("reads UTF-8", () => {
    const utf8 = new TextEncoder().encode("sku,title\nA,Café ™");
    expect(decodeCsvFile(utf8)).toEqual({
      text: "sku,title\nA,Café ™",
      encoding: "utf-8",
    });
  });

  it("falls back to Windows-1252 for Excel's default CSV", () => {
    // "Café ™ ½" in Windows-1252
    const result = decodeCsvFile(
      bytes(0x43, 0x61, 0x66, 0xe9, 0x20, 0x99, 0x20, 0xbd),
    );
    expect(result).toEqual({ text: "Café ™ ½", encoding: "windows-1252" });
  });

  it("refuses UTF-16 with instructions", () => {
    expect(() => decodeCsvFile(bytes(0xff, 0xfe, 0x61, 0x00))).toThrow(
      /CSV UTF-8/,
    );
    expect(() => decodeCsvFile(bytes(0xfe, 0xff, 0x00, 0x61))).toThrow(
      /CSV UTF-8/,
    );
  });
});
