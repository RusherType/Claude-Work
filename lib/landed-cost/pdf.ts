/**
 * CD-051: a saved quote as a PDF (pdf-lib, standard fonts). The figures are the saved ones, never
 * recomputed here. Standard fonts only encode WinAnsi, so other characters become "?"; embedding a
 * Unicode font is a follow-up for non-Latin product titles.
 */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { formatHtsCode } from "@/lib/catalog/listing";
import { Decimal, formatUsd } from "@/lib/tariff/money";
import type { SavedQuote } from "./saved";

const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

/** Text the standard fonts can draw: anything outside WinAnsi becomes "?". */
export function pdfText(s: string): string {
  let out = "";
  for (const ch of s.replace(/[\r\n\t]+/g, " ")) {
    const cp = ch.codePointAt(0)!;
    const ok =
      (cp >= 0x20 && cp <= 0x7e) ||
      (cp >= 0xa0 && cp <= 0xff) ||
      WIN_ANSI_EXTRA.has(ch);
    out += ok ? ch : "?";
  }
  return out;
}

const money = (s: string) => formatUsd(new Decimal(s));
const MARGIN = 48;
const PAGE: [number, number] = [612, 792]; // US Letter
const GREY = rgb(0.36, 0.38, 0.42);

class Writer {
  page: PDFPage;
  y: number;
  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
  ) {
    this.page = doc.addPage(PAGE);
    this.y = PAGE[1] - MARGIN;
  }
  private room(height: number) {
    if (this.y - height < MARGIN) {
      this.page = this.doc.addPage(PAGE);
      this.y = PAGE[1] - MARGIN;
    }
  }
  /** One line of text, cut to the width it has. */
  line(
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      x?: number;
      grey?: boolean;
      width?: number;
    } = {},
  ) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const x = opts.x ?? MARGIN;
    const width = opts.width ?? PAGE[0] - MARGIN - x;
    let t = pdfText(text);
    while (t.length > 1 && font.widthOfTextAtSize(t, size) > width)
      t = `${t.slice(0, -2)}…`;
    this.room(size + 4);
    this.page.drawText(t, {
      x,
      y: this.y - size,
      size,
      font,
      color: opts.grey ? GREY : rgb(0.08, 0.09, 0.11),
    });
  }
  /** Label on the left, amount on the right, then move down. */
  row(
    label: string,
    amount: string,
    opts: { bold?: boolean; size?: number } = {},
  ) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const a = pdfText(amount);
    const aw = font.widthOfTextAtSize(a, size);
    this.line(label, { ...opts, width: PAGE[0] - 2 * MARGIN - aw - 12 });
    this.page.drawText(a, {
      x: PAGE[0] - MARGIN - aw,
      y: this.y - size,
      size,
      font,
    });
    this.down(size + 5);
  }
  text(
    s: string,
    opts: { size?: number; bold?: boolean; grey?: boolean } = {},
  ) {
    this.line(s, opts);
    this.down((opts.size ?? 10) + 5);
  }
  down(h: number) {
    this.y -= h;
  }
}

export async function quotePdf(
  quote: SavedQuote,
  workspaceName: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfText(`Landed-cost quote: ${quote.name}`));
  doc.setProducer("ClearDuty");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);

  w.text("Landed-cost quote", { size: 18, bold: true });
  w.text(quote.name, { size: 12 });
  w.text(
    `${workspaceName} · saved ${quote.createdAt.slice(0, 10)} · entry date ${quote.entryDate}`,
    { grey: true },
  );
  w.text(
    `Origin ${quote.origin} · ${quote.mode} · ${quote.totals.entryType} entry · values in ${quote.currency}` +
      (quote.currency === "USD" ? "" : ` at ${quote.fxRateToUsd} USD each`) +
      (quote.carrier ? ` · carrier ${quote.carrier}` : ""),
    { grey: true },
  );
  if (quote.totals.status === "needs_review")
    w.text(
      "Needs review: parts of this quote could not be priced with certainty.",
      {
        bold: true,
      },
    );
  w.down(8);

  for (const l of quote.lines) {
    w.text(`${l.title}${l.sku ? ` (${l.sku})` : ""}`, { bold: true });
    w.text(
      `HTS ${formatHtsCode(l.code)} · ${l.confirmed ? "confirmed code" : "suggested code, not confirmed"} · ${l.quantity} × ${l.unitValue} ${quote.currency}`,
      { grey: true },
    );
    w.row("Customs value", money(l.result.customsValueUsd));
    for (const c of l.result.components)
      w.row(`  ${c.label} (${c.basis})`, money(c.amount));
    w.row("Share of shipment fees", money(l.result.allocatedFees));
    w.row("Line landed cost", money(l.result.landedCost), { bold: true });
    for (const warning of l.result.warnings)
      w.text(`Note: ${warning}`, { size: 8, grey: true });
    w.down(6);
  }

  w.text("Shipment fees", { bold: true });
  if (quote.totals.shipmentFees.length === 0)
    w.text("None apply.", { grey: true });
  for (const c of quote.totals.shipmentFees)
    w.row(`${c.label} (${c.basis})`, money(c.amount));
  w.down(6);
  const t = quote.totals.totals;
  w.row("Customs value", money(t.customsValue));
  w.row("Duty", money(t.duties));
  w.row("Fees", money(t.fees));
  w.row("Landed cost", money(t.landedCost), { bold: true, size: 12 });
  for (const warning of [...quote.totals.notices, ...quote.totals.warnings])
    w.text(`Note: ${warning}`, { size: 8, grey: true });
  w.down(10);
  w.text(
    "An estimate from published tariff data in force on the entry date, not a customs ruling.",
    { size: 8, grey: true },
  );
  w.text("Codes marked suggested have not been confirmed by a person.", {
    size: 8,
    grey: true,
  });
  return doc.save();
}
