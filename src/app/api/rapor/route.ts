import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getContext } from "@/lib/context";
import { formatDate } from "@/lib/dates";
import { styleHeader, workbookResponse } from "@/lib/excel";
import { STATUSES, STATUS_LABELS } from "@/lib/labels";
import { getReport, getTermOptions, parseReportFilter } from "@/lib/reports";

export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return new Response("Yetkisiz", { status: 401 });
  const { branch, academicYear } = await getContext();
  if (!branch || !academicYear) return new Response("Kurum veya yıl seçili değil", { status: 400 });

  const filter = parseReportFilter(Object.fromEntries(request.nextUrl.searchParams), await getTermOptions(academicYear.id));
  const report = await getReport(branch.id, academicYear.id, filter);
  const otherStatuses = STATUSES.filter((status) => status !== "ABSENT");
  const statusHeader = (status: (typeof STATUSES)[number]) => STATUS_LABELS[status].toLocaleUpperCase("tr-TR");
  const workbook = new ExcelJS.Workbook();

  const studentSheet = workbook.addWorksheet("Öğrenci Özeti");
  studentSheet.addRow(["NO", "AD SOYAD", "SINIF", "DEVAMSIZ GÜN", "TAM GÜN", "YARIM GÜN", "GEÇ", "ERKEN ÇIKIŞ", "MAZERETLİ", "VELİYE ULAŞILMAYAN"]);
  for (const row of report.studentRows) {
    studentSheet.addRow([row.studentNo, row.fullName, row.className, row.absentDays, row.fullDays, row.halfDays, row.lateEquivalent, row.counts.EARLY_LEAVE, row.counts.EXCUSED, row.uncontacted]);
  }
  styleHeader(studentSheet, [8, 30, 12, 14, 10, 11, 8, 12, 11, 20]);

  const classSheet = workbook.addWorksheet("Sınıf Özeti");
  classSheet.addRow(["SINIF", "ÖĞRENCİ", "YOKLAMA ALINAN GÜN", "DEVAMSIZ GÜN", "ÖĞRENCİ BAŞINA", ...otherStatuses.map(statusHeader)]);
  for (const row of report.classRows) {
    classSheet.addRow([
      row.className,
      row.studentCount,
      row.takenDays.size,
      row.absentStudentDays,
      row.studentCount ? Number((row.absentStudentDays / row.studentCount).toFixed(2)) : null,
      ...otherStatuses.map((s) => row.counts[s]),
    ]);
  }
  styleHeader(classSheet, [12, 10, 20, 14, 16, 10, 13, 12]);

  const daySheet = workbook.addWorksheet("Gün Özeti");
  daySheet.addRow(["TARİH", "DEVAMSIZ ÖĞRENCİ", "TAM GÜN", "YARIM GÜN", "GEÇ", "MAZERETLİ"]);
  for (const row of report.dayRows) {
    daySheet.addRow([formatDate(row.date), row.students.size, row.fullDays, row.halfDays, row.late, row.excused]);
  }
  styleHeader(daySheet, [12, 18, 10, 11, 8, 11]);

  const detailSheet = workbook.addWorksheet("Detay");
  detailSheet.addRow(["TARİH", "NO", "AD SOYAD", "SINIF", "YOKLAMA", "DURUM", "AÇIKLAMA", "VELİ BİLGİLENDİRME"]);
  for (const row of report.records) {
    detailSheet.addRow([formatDate(row.date), row.studentNo, row.fullName, row.className, row.lesson, STATUS_LABELS[row.status], row.note, row.contact]);
  }
  styleHeader(detailSheet, [12, 8, 30, 12, 12, 12, 35, 45]);

  const classRow = report.classRows.find((row) => row.classGroupId === filter.classGroupId);
  const suffix = filter.classGroupId && classRow ? `-${classRow.className.replace(/\//g, "")}` : "";
  return workbookResponse(workbook, `devamsizlik-raporu-${filter.from}-${filter.to}${suffix}.xlsx`);
}
