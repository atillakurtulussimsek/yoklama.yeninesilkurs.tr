import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getContext } from "@/lib/context";
import { findChronicStudents } from "@/lib/chronic";
import { formatDate, isDateStr, todayStr } from "@/lib/dates";
import { styleHeader, workbookResponse } from "@/lib/excel";
import { formatPhone } from "@/lib/phone";

export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return new Response("Yetkisiz", { status: 401 });
  const { branch, academicYear } = await getContext();
  if (!branch || !academicYear) return new Response("Kurum veya yıl seçili değil", { status: 400 });

  const dateParam = request.nextUrl.searchParams.get("tarih");
  const endDate = isDateStr(dateParam) ? dateParam : todayStr();
  const { students } = await findChronicStudents(branch.id, academicYear.id, endDate);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sürekli Devamsızlar");
  sheet.addRow(["NO", "AD SOYAD", "SINIF", "VELİ TELEFONU", "DEVAMSIZ GÜN", "EN UZUN ÜST ÜSTE", "DEVAM EDEN", "GEÇ", "SON DEVAMSIZLIK", "NEDEN"]);
  for (const student of students) {
    sheet.addRow([
      student.studentNo,
      student.fullName,
      student.className,
      formatPhone(student.parentPhone),
      student.absentDays,
      student.maxConsecutive,
      student.currentConsecutive,
      student.lateCount,
      formatDate(student.lastAbsentDate),
      student.reasons.join(" · "),
    ]);
  }
  styleHeader(sheet, [8, 30, 12, 16, 14, 18, 12, 6, 16, 45]);

  return workbookResponse(workbook, `surekli-devamsizlar-${endDate}.xlsx`);
}
