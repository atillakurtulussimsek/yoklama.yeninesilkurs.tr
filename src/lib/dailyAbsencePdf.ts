import path from "node:path";
import PDFDocument from "pdfkit";
import { DAILY_KIND_LABELS } from "@/lib/dailyLabels";
import { formatContacts, type DailyFilter, type DailyRow } from "@/lib/dailyAbsenceReport";
import { formatDate, formatDateLong, formatDateTime } from "@/lib/dates";
import { formatDays, SESSION_LABELS } from "@/lib/dayAbsence";

const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");
const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#d1d5db";
const HEAD_BG = "#e5e7eb";
const ZEBRA = "#f9fafb";

export async function renderDailyAbsencePdf(params: {
  branchName: string;
  academicYearName: string;
  className?: string;
  filter: DailyFilter;
  rows: DailyRow[];
  preparedBy: string;
}) {
  const { filter, rows, className } = params;
  const branch = { name: params.branchName };
  const academicYear = { name: params.academicYearName };
  const user = { fullName: params.preparedBy };
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 40, bufferPages: true, info: { Title: `Günlük Devamsızlık Raporu ${formatDate(filter.date)}` } });
  doc.registerFont("Regular", path.join(FONT_DIR, "DejaVuSans.ttf"));
  doc.registerFont("Bold", path.join(FONT_DIR, "DejaVuSans-Bold.ttf"));
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const pageWidth = doc.page.width - left - doc.page.margins.right;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom;

  const columns = [
    { title: "Sıra", width: 30, align: "center" as const },
    { title: "No", width: 38, align: "center" as const },
    { title: "Adı Soyadı", width: 130 },
    { title: "Sınıf", width: 62 },
    { title: "Devamsızlık", width: 90 },
    { title: "Katılmadığı dersler", width: 110 },
    { title: "Veli görüşmesi", width: 200 },
    { title: "Açıklama", width: 0 },
  ];
  columns[columns.length - 1].width = pageWidth - columns.slice(0, -1).reduce((sum, c) => sum + c.width, 0);

  const drawTitle = () => {
    doc.fillColor(INK).font("Bold").fontSize(14).text(branch.name.toLocaleUpperCase("tr-TR"), left, doc.y, { width: pageWidth, align: "center" });
    doc.font("Bold").fontSize(12).text("GÜNLÜK DEVAMSIZLIK RAPORU", { width: pageWidth, align: "center" });
    doc.moveDown(0.3);
    doc.font("Regular").fontSize(9).fillColor(MUTED);
    const meta = [`Tarih: ${formatDateLong(filter.date)}`, `Eğitim-öğretim yılı: ${academicYear.name}`, className ? `Sınıf: ${className}` : "Tüm sınıflar", filter.kind ? `Tür: ${DAILY_KIND_LABELS[filter.kind]}` : null].filter(Boolean).join("   ·   ");
    doc.text(meta, { width: pageWidth, align: "center" });
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
  rows.forEach((row, index) => {
    const kind = `${DAILY_KIND_LABELS[row.kind]}${row.session ? `\n(${SESSION_LABELS[row.session]})` : ""}${row.days ? `\n${formatDays(row.days)} gün` : ""}`;
    drawRow(
      [
        String(index + 1),
        String(row.studentNo),
        row.fullName,
        row.className,
        kind,
        row.missedLessons,
        row.contacts.length ? formatContacts(row.contacts) : "Veliye ulaşılmadı",
        row.note ?? "",
      ],
      index % 2 === 1,
    );
  });
  if (rows.length === 0) {
    doc.moveDown().font("Regular").fontSize(9).fillColor(MUTED).text("Bu tarihte günlük devamsızlık kaydı yok.", left).fillColor(INK);
  }

  // Özet
  const totals = { days: 0, FULL_DAY: 0, HALF_DAY: 0, LATE: 0, EXCUSED: 0, uncontacted: 0 };
  for (const row of rows) {
    totals.days += row.days;
    totals[row.kind]++;
    if (row.contacts.length === 0) totals.uncontacted++;
  }
  if (doc.y + 110 > bottomLimit()) doc.addPage();
  doc.moveDown(0.8);
  doc.font("Bold").fontSize(9).text("Özet: ", left, doc.y, { continued: true });
  doc.font("Regular").text(
    `${rows.length} öğrenci · Tam gün ${totals.FULL_DAY} · Yarım gün ${totals.HALF_DAY} · Geç ${totals.LATE} · Mazeretli ${totals.EXCUSED} · Toplam ${formatDays(totals.days)} gün · Veliye ulaşılmayan ${totals.uncontacted}`,
  );

  // İmza alanları: eşit genişlikte üç blok
  const signTop = bottomLimit() - 62;
  const blocks = [
    { title: "Hazırlayan", name: user.fullName },
    { title: "Müdür Yardımcısı", name: "" },
    { title: "Müdür", name: "" },
  ];
  const blockWidth = 200;
  const gap = (pageWidth - blockWidth * blocks.length) / (blocks.length - 1);
  blocks.forEach((block, i) => {
    const x = left + i * (blockWidth + gap);
    doc.font("Bold").fontSize(9).fillColor(INK).text(block.title, x, signTop, { width: blockWidth, align: "center" });
    doc.font("Regular").fontSize(8).fillColor(MUTED).text(block.name || " ", x, signTop + 14, { width: blockWidth, align: "center" });
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
