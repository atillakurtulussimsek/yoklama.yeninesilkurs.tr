import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getContext } from "@/lib/context";
import { classLabel, compareClassGroups, fullName } from "@/lib/classGroups";
import { formatDate, formatDateLong, formatDateTime } from "@/lib/dates";
import { CONTACT_LABELS, STATUS_LABELS } from "@/lib/labels";
import { renderTablePdf } from "@/lib/pdfReport";
import { formatPhone, primaryPhone } from "@/lib/phone";
import { getClassGroupOptions } from "@/lib/reports";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Yetkisiz", { status: 401 });
  const { branch, academicYear } = await getContext();
  const id = Number((await context.params).id);
  if (!branch || !academicYear || !Number.isInteger(id)) return new Response("Bulunamadı", { status: 404 });
  const classFilter = Number(request.nextUrl.searchParams.get("sinif")) || 0;

  const [exam, classGroups] = await Promise.all([
    prisma.exam.findFirst({
      where: { id, branchId: branch.id, academicYearId: academicYear.id },
      include: {
        classGroups: { select: { classGroupId: true } },
        attendances: {
          include: {
            enrollment: {
              select: {
                studentNo: true,
                classGroupId: true,
                classGroup: { select: { gradeLevel: true, name: true } },
                student: { select: { firstName: true, lastName: true, guardians: { select: { contactOrder: true, guardian: { select: { phone: true } } } } } },
              },
            },
            contactLogs: { include: { guardian: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "asc" } },
          },
        },
      },
    }),
    getClassGroupOptions(branch.id, academicYear.id),
  ]);
  if (!exam) return new Response("Bulunamadı", { status: 404 });

  const scopedIds = exam.classGroups.map((item) => item.classGroupId);
  const examGroups = scopedIds.length ? classGroups.filter((g) => scopedIds.includes(g.id)) : classGroups;
  const selectedClass = classGroups.find((g) => g.id === classFilter);
  const rows = [...exam.attendances]
    .filter((item) => !classFilter || item.enrollment.classGroupId === classFilter)
    .sort(
      (a, b) =>
        compareClassGroups(a.enrollment.classGroup, b.enrollment.classGroup) ||
        fullName(a.enrollment.student).localeCompare(fullName(b.enrollment.student), "tr-TR"),
    );

  const counts = { ABSENT: 0, LATE: 0, EXCUSED: 0, EARLY_LEAVE: 0, uncontacted: 0 };
  for (const item of rows) {
    counts[item.status]++;
    if (item.contactLogs.length === 0) counts.uncontacted++;
  }
  const statusText = (status: keyof typeof STATUS_LABELS) => (status === "ABSENT" ? "Katılmadı" : STATUS_LABELS[status]);

  const buffer = await renderTablePdf({
    documentTitle: `Deneme Sınavı Yoklama Raporu ${formatDate(exam.date)}`,
    heading: branch.name.toLocaleUpperCase("tr-TR"),
    subheading: "DENEME SINAVI YOKLAMA RAPORU",
    meta: [
      `Sınav: ${exam.name}`,
      `Tarih: ${formatDateLong(exam.date)}`,
      `Eğitim-öğretim yılı: ${academicYear.name}`,
      selectedClass ? `Sınıf: ${selectedClass.label}` : `Şubeler: ${examGroups.map((g) => g.label).join(", ")}`,
    ].join("   ·   "),
    columns: [
      { title: "Sıra", width: 30, align: "center" },
      { title: "No", width: 38, align: "center" },
      { title: "Adı Soyadı", width: 140 },
      { title: "Sınıf", width: 90 },
      { title: "Durum", width: 70 },
      { title: "Veli telefonu", width: 90 },
      { title: "Veli görüşmesi", width: 220 },
      { title: "Açıklama", width: 0 },
    ],
    rows: rows.map((item, index) => [
      String(index + 1),
      String(item.enrollment.studentNo),
      fullName(item.enrollment.student),
      classLabel(item.enrollment.classGroup),
      statusText(item.status),
      formatPhone(primaryPhone(item.enrollment.student.guardians)),
      item.contactLogs.length
        ? item.contactLogs
            .map((log) => `${CONTACT_LABELS[log.result]}${log.guardian ? ` – ${fullName(log.guardian)}` : ""}${log.note ? `: ${log.note}` : ""} (${formatDateTime(log.createdAt)})`)
            .join("\n")
        : "Veliye ulaşılmadı",
      item.note ?? "",
    ]),
    emptyText: "Bu sınavda işaretli öğrenci yok; tüm öğrenciler katıldı.",
    summary: `${rows.length} öğrenci · Katılmadı ${counts.ABSENT} · Geç ${counts.LATE} · Mazeretli ${counts.EXCUSED} · Veliye ulaşılmayan ${counts.uncontacted}`,
    preparedBy: user.fullName,
  });

  const suffix = selectedClass ? `-${selectedClass.label.replace(/\//g, "")}` : "";
  return new Response(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`sinav-yoklama-${formatDate(exam.date)}${suffix}.pdf`)}`,
    },
  });
}
