import path from "node:path";
import PDFDocument from "pdfkit";
import { formatDateTime } from "@/lib/dates";

const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");
const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#d1d5db";
const HEAD_BG = "#e5e7eb";
const ZEBRA = "#f9fafb";

export type PdfColumn = { title: string; width: number; align?: "left" | "center" | "right" };

export type PdfReportSpec = {
  documentTitle: string;
  heading: string;
  subheading: string;
  meta: string;
  /** Son sütunun width değeri 0 ise kalan genişliği alır */
  columns: PdfColumn[];
  rows: string[][];
  emptyText: string;
  summary: string;
  preparedBy: string;
  signatures?: string[];
};

/** Yatay A4, başlık + zebra tablo + özet + imza blokları + sayfa altı içeren standart rapor. */
export async function renderTablePdf(spec: PdfReportSpec): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 40, bufferPages: true, info: { Title: spec.documentTitle } });
  doc.registerFont("Regular", path.join(FONT_DIR, "DejaVuSans.ttf"));
  doc.registerFont("Bold", path.join(FONT_DIR, "DejaVuSans-Bold.ttf"));
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const pageWidth = doc.page.width - left - doc.page.margins.right;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom;

  const columns = spec.columns.map((column) => ({ ...column }));
  const last = columns[columns.length - 1];
  if (last.width === 0) last.width = pageWidth - columns.slice(0, -1).reduce((sum, c) => sum + c.width, 0);

  const drawTitle = () => {
    doc.fillColor(INK).font("Bold").fontSize(14).text(spec.heading, left, doc.y, { width: pageWidth, align: "center" });
    doc.font("Bold").fontSize(12).text(spec.subheading, { width: pageWidth, align: "center" });
    doc.moveDown(0.3);
    doc.font("Regular").fontSize(9).fillColor(MUTED).text(spec.meta, { width: pageWidth, align: "center" });
    doc.fillColor(INK);
    doc.moveDown(0.8);
  };

  const drawHeaderRow = () => {
    doc.font("Bold").fontSize(8);
    const y = doc.y;
    const h = 20;
    doc.rect(left, y, pageWidth, h).fill(HEAD_BG);
    let x = left;
    doc.fillColor(INK);
    for (const column of columns) {
      doc.text(column.title, x + 4, y + 6, { width: column.width - 8, align: column.align ?? "left" });
      x += column.width;
    }
    doc.rect(left, y, pageWidth, h).stroke(LINE);
    doc.y = y + h;
  };

  const drawRow = (cells: string[], zebra: boolean) => {
    doc.font("Regular").fontSize(8);
    const heights = cells.map((cell, i) => doc.heightOfString(cell || " ", { width: columns[i].width - 8 }));
    const h = Math.max(...heights) + 8;
    if (doc.y + h > bottomLimit() - 90) {
      doc.addPage();
      drawTitle();
      drawHeaderRow();
    }
    const y = doc.y;
    if (zebra) doc.rect(left, y, pageWidth, h).fill(ZEBRA);
    doc.fillColor(INK);
    let x = left;
    for (let i = 0; i < cells.length; i++) {
      doc.text(cells[i] || "", x + 4, y + 4, { width: columns[i].width - 8, align: columns[i].align ?? "left" });
      x += columns[i].width;
      doc.moveTo(x, y).lineTo(x, y + h).stroke(LINE);
    }
    doc.rect(left, y, pageWidth, h).stroke(LINE);
    doc.x = left;
    doc.y = y + h;
  };

  drawTitle();
  drawHeaderRow();
  spec.rows.forEach((row, index) => drawRow(row, index % 2 === 1));
  if (spec.rows.length === 0) {
    doc.moveDown().font("Regular").fontSize(9).fillColor(MUTED).text(spec.emptyText, left).fillColor(INK);
  }

  if (doc.y + 110 > bottomLimit()) doc.addPage();
  doc.moveDown(0.8);
  doc.font("Bold").fontSize(9).text("Özet: ", left, doc.y, { continued: true });
  doc.font("Regular").text(spec.summary);

  // İmza alanları: eşit genişlikte bloklar
  const signTop = bottomLimit() - 62;
  const titles = spec.signatures ?? ["Hazırlayan", "Müdür Yardımcısı", "Müdür"];
  const blockWidth = 200;
  const gap = titles.length > 1 ? (pageWidth - blockWidth * titles.length) / (titles.length - 1) : 0;
  titles.forEach((title, i) => {
    const x = left + i * (blockWidth + gap);
    doc.font("Bold").fontSize(9).fillColor(INK).text(title, x, signTop, { width: blockWidth, align: "center" });
    doc.font("Regular").fontSize(8).fillColor(MUTED).text(i === 0 ? spec.preparedBy : " ", x, signTop + 14, { width: blockWidth, align: "center" });
    doc.moveTo(x + 20, signTop + 46).lineTo(x + blockWidth - 20, signTop + 46).stroke(LINE);
    doc.fontSize(7).text("İmza", x, signTop + 49, { width: blockWidth, align: "center" });
  });
  doc.fillColor(INK);

  // Sayfa altı: genişlik verilmeden yazılır ki pdfkit satır sonu/sayfa kontrolü yapmasın
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    const footer = `Yeni Nesil Yoklama Sistemi · Oluşturma: ${formatDateTime(new Date())} · Sayfa ${i + 1}/${range.count}`;
    doc.font("Regular").fontSize(7).fillColor(MUTED);
    const textWidth = doc.widthOfString(footer);
    doc.text(footer, left + pageWidth - textWidth, doc.page.height - doc.page.margins.bottom + 8, { lineBreak: false });
  }
  doc.end();
  return done;
}
