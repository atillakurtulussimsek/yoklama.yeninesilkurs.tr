import { DAILY_KIND_LABELS } from "@/lib/dailyLabels";
import { formatContacts, type DailyFilter, type DailyRow } from "@/lib/dailyAbsenceReport";
import { formatDate, formatDateLong } from "@/lib/dates";
import { formatDays, SESSION_LABELS } from "@/lib/dayAbsence";
import { renderTablePdf } from "@/lib/pdfReport";

export async function renderDailyAbsencePdf(params: {
  branchName: string;
  academicYearName: string;
  className?: string;
  filter: DailyFilter;
  rows: DailyRow[];
  preparedBy: string;
}) {
  const { filter, rows, className } = params;

  const totals = { days: 0, FULL_DAY: 0, HALF_DAY: 0, LATE: 0, EXCUSED: 0, uncontacted: 0 };
  for (const row of rows) {
    totals.days += row.days;
    totals[row.kind]++;
    if (row.contacts.length === 0) totals.uncontacted++;
  }

  return renderTablePdf({
    documentTitle: `Günlük Devamsızlık Raporu ${formatDate(filter.date)}`,
    heading: params.branchName.toLocaleUpperCase("tr-TR"),
    subheading: "GÜNLÜK DEVAMSIZLIK RAPORU",
    meta: [
      `Tarih: ${formatDateLong(filter.date)}`,
      `Eğitim-öğretim yılı: ${params.academicYearName}`,
      className ? `Sınıf: ${className}` : "Tüm sınıflar",
      filter.kind ? `Tür: ${DAILY_KIND_LABELS[filter.kind]}` : null,
    ]
      .filter(Boolean)
      .join("   ·   "),
    columns: [
      { title: "Sıra", width: 30, align: "center" },
      { title: "No", width: 38, align: "center" },
      { title: "Adı Soyadı", width: 130 },
      { title: "Sınıf", width: 62 },
      { title: "Devamsızlık", width: 90 },
      { title: "Katılmadığı dersler", width: 110 },
      { title: "Veli görüşmesi", width: 200 },
      { title: "Açıklama", width: 0 },
    ],
    rows: rows.map((row, index) => [
      String(index + 1),
      String(row.studentNo),
      row.fullName,
      row.className,
      `${DAILY_KIND_LABELS[row.kind]}${row.session ? `\n(${SESSION_LABELS[row.session]})` : ""}${row.days ? `\n${formatDays(row.days)} gün` : ""}`,
      row.missedLessons,
      row.contacts.length ? formatContacts(row.contacts) : "Veliye ulaşılmadı",
      row.note ?? "",
    ]),
    emptyText: "Bu tarihte günlük devamsızlık kaydı yok.",
    summary: `${rows.length} öğrenci · Tam gün ${totals.FULL_DAY} · Yarım gün ${totals.HALF_DAY} · Geç ${totals.LATE} · Mazeretli ${totals.EXCUSED} · Toplam ${formatDays(totals.days)} gün · Veliye ulaşılmayan ${totals.uncontacted}`,
    preparedBy: params.preparedBy,
  });
}
