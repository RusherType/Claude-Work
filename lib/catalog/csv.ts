/**
 * RFC 4180 CSV reader: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF
 * or LF line ends, and a UTF-8 byte-order mark. Runs in the browser on the uploaded file, so it is
 * written to be linear in the input size.
 */

export class CsvError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
  }
}

export type CsvRow = {
  /** Line in the file where the row starts (1 = first line). */
  line: number;
  cells: string[];
};

/** Returns the rows as arrays of cell strings. Blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  return parseCsvRows(text).map((r) => r.cells);
}

/** Like parseCsv, keeping the line each row starts on (rows can span lines inside quotes). */
export function parseCsvRows(text: string): CsvRow[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let rowLine = 1;
  let cell = "";
  let quoted = false;
  let cellStarted = false; // the current cell has content or opened a quote
  let afterQuote = false; // the current cell's closing quote was just read
  let line = 1;
  let quoteLine = 1;

  const endCell = () => {
    row.push(cell);
    cell = "";
    cellStarted = false;
    afterQuote = false;
  };
  const endRow = () => {
    endCell();
    if (!(row.length === 1 && row[0] === ""))
      rows.push({ line: rowLine, cells: row });
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
      continue;
    }
    if (afterQuote && ch !== "," && ch !== "\n" && ch !== "\r") {
      throw new CsvError(
        `Line ${line}: text after a closing quote; wrap the whole cell in quotes and double any quotes inside`,
        line,
      );
    }
    if (ch === '"' && !cellStarted) {
      quoted = true;
      cellStarted = true;
      quoteLine = line;
    } else if (ch === ",") {
      endCell();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      endRow();
      line++;
      rowLine = line;
    } else {
      // A quote in the middle of an unquoted cell (5" screen) is kept as text.
      cell += ch;
      cellStarted = true;
    }
  }
  if (quoted) {
    throw new CsvError(
      `Line ${quoteLine}: a quoted cell is never closed`,
      quoteLine,
    );
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}

/** Quote a cell for CSV output when it needs it. Leading =, +, -, @ are neutralised so a
 * spreadsheet never runs them as formulas. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/**
 * Decode an uploaded file. UTF-8 (with or without a byte-order mark) is read as is; anything that
 * is not valid UTF-8 is read as Windows-1252, which is what Excel on Windows saves as
 * "CSV (Comma delimited)". UTF-16 files are refused with a message.
 */
export function decodeCsvFile(bytes: Uint8Array): {
  text: string;
  encoding: "utf-8" | "windows-1252";
} {
  if (
    bytes.length >= 2 &&
    ((bytes[0] === 0xff && bytes[1] === 0xfe) ||
      (bytes[0] === 0xfe && bytes[1] === 0xff))
  ) {
    throw new CsvError(
      'This file is saved as UTF-16 text. In Excel choose "CSV UTF-8 (Comma delimited)" and try again',
      1,
    );
  }
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "utf-8",
    };
  } catch {
    return {
      text: new TextDecoder("windows-1252").decode(bytes),
      encoding: "windows-1252",
    };
  }
}
