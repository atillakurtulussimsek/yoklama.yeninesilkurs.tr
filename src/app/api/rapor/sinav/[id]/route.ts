import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getContext } from "@/lib/context";
import { classLabel, compareClassGroups, fullName } from "@/lib/classGroups";
import { formatDate, formatDateTime } from "@/lib/dates";
import { styleHeader, workbookResponse } from "@/lib/excel";
import { CONTACT_LABELS, STATUS_LABELS } from "@/lib/labels";
import { formatPhone, primaryPhone } from "@/lib/phone";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Yetkisiz", { status: 401 });
  const { branch, academicYear } = await getContext();
  const id = Number((await context.params).id);
  if (!branch || !academicYear || !Number.isInteger(id)) return new Response("Bulunamadı", { status: 404 });

  const exam = await prisma.exam.findFirst({
    where: { id, branchId: branch.id, academicYearId: academicYear.id },
    include: {
      attendances: {
        include: {
          enrollment: {
            select: {
              studentNo: true,
              classGroup: { select: { gradeLevel: true, name: true } },
              student: { select: { firstName: true, lastName: true, guardians: { select: { contactOrder: true, guardian: { select: { phone: true } } } } } },
            },
          },
          contactLogs: { include: { guardian: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!exam) return new Response("Bulunamadı", { status: 404 });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Katılmayanlar");
  sheet.addRow(["NO", "AD SOYAD", "SINIF", "DURUM", "AÇIKLAMA", "VELİ TELEFONU", "VELİ GÖRÜŞMESİ"]);
  const rows = [...exam.attendances].sort(
    (a, b) => compareClassGroups(a.enrollment.classGroup, b.enrollment.classGroup) || fullName(a.enrollment.student).localeCompare(fullName(b.enrollment.student), "tr-TR"),
  );
  for (const item of rows) {
    sheet.addRow([
      item.enrollment.studentNo,
      fullName(item.enrollment.student),
      classLabel(item.enrollment.classGroup),
      item.status === "ABSENT" ? "Katılmadı" : STATUS_LABELS[item.status],
      item.note ?? "",
      formatPhone(primaryPhone(item.enrollment.student.guardians)),
      item.contactLogs
        .map((log) => `${CONTACT_LABELS[log.result]}${log.guardian ? ` – ${fullName(log.guardian)}` : ""}${log.note ? `: ${log.note}` : ""} (${formatDateTime(log.createdAt)})`)
        .join("; "),
    ]);
  }
  styleHeader(sheet, [8, 30, 12, 12, 30, 16, 60]);

  return workbookResponse(workbook, `sinav-yoklama-${formatDate(exam.date)}-${exam.name.replace(/[^\wğüşıöçĞÜŞİÖÇ-]+/g, "_")}.xlsx`);
}
