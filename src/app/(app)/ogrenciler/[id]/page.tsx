import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/context";
import { classLabel, fullName } from "@/lib/classGroups";
import { formatDate, formatDateTime, toDbDate } from "@/lib/dates";
import { sortGuardianLinks } from "@/lib/phone";
import { CONTACT_COLORS, CONTACT_LABELS, STATUSES, STATUS_COLORS, STATUS_LABELS } from "@/lib/labels";
import { formatDays, summarizeDay, type DayRecord } from "@/lib/dayAbsence";
import { fromDbDate } from "@/lib/dates";
import { getClassGroupOptions } from "@/lib/reports";
import StudentForm from "../StudentForm";
import EnrollmentActions from "./EnrollmentActions";
import GuardianForm from "./GuardianForm";

export default async function StudentDetailPage({ params }: PageProps<"/ogrenciler/[id]">) {
  const { user, branch, academicYear } = await requireContext();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [enrollment, classGroups, lessonPeriods] = await Promise.all([
    prisma.studentEnrollment.findFirst({
      where: { id, branchId: branch.id, academicYearId: academicYear.id },
      include: {
        classGroup: { select: { gradeLevel: true, name: true } },
        student: { include: { guardians: { include: { guardian: true } } } },
        attendanceRecords: {
          orderBy: [{ date: "desc" }, { slot: "asc" }],
          include: {
            lessonPeriod: { select: { name: true } },
            contactLogs: {
              include: { user: { select: { fullName: true } }, guardian: { select: { firstName: true, lastName: true } } },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    }),
    getClassGroupOptions(branch.id, academicYear.id),
    prisma.lessonPeriod.findMany({ where: { branchId: branch.id }, select: { id: true, session: true } }),
  ]);
  if (!enrollment) notFound();

  const counts = new Map(STATUSES.map((status) => [status, 0]));
  const byDay = new Map<string, DayRecord[]>();
  for (const record of enrollment.attendanceRecords) {
    counts.set(record.status, counts.get(record.status)! + 1);
    const day = fromDbDate(record.date);
    byDay.set(day, [...(byDay.get(day) ?? []), { slot: record.slot, status: record.status }]);
  }
  const sessions = enrollment.classGroupId
    ? await prisma.attendanceSession.findMany({
        where: { classGroupId: enrollment.classGroupId, date: { in: [...byDay.keys()].map(toDbDate) } },
        select: { date: true, slot: true },
      })
    : [];
  const takenSlots = new Map<string, Set<number>>();
  for (const session of sessions) {
    const day = fromDbDate(session.date);
    takenSlots.set(day, new Set([...(takenSlots.get(day) ?? []), session.slot]));
  }
  const sessionOf = new Map(lessonPeriods.map((lesson) => [lesson.id, lesson.session]));
  let absentDays = 0;
  let lateEquivalent = 0;
  for (const [day, dayRecords] of byDay) {
    const summary = summarizeDay(dayRecords, takenSlots.get(day) ?? [], sessionOf);
    absentDays += summary.days;
    lateEquivalent += summary.lateCount;
  }
  const guardians = sortGuardianLinks(enrollment.student.guardians);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/ogrenciler" className="text-sm text-gray-500 hover:text-indigo-600">← Öğrenciler</Link>
          <h1 className="text-2xl font-semibold">{fullName(enrollment.student)}</h1>
          <p className="text-sm text-gray-500">
            No {enrollment.studentNo} · {classLabel(enrollment.classGroup)}
            {enrollment.field ? ` · ${enrollment.field}` : ""}
            {enrollment.status === "CANCELLED" && (
              <span className="badge ml-2 bg-gray-100 text-gray-600 ring-gray-200">Kayıt iptali</span>
            )}
          </p>
        </div>
        <EnrollmentActions id={enrollment.id} status={enrollment.status} isAdmin={user.role === "ADMIN"} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="card p-4">
          <div className="text-xs text-gray-500">Devamsız gün</div>
          <div className="mt-1 text-2xl font-semibold">{formatDays(absentDays)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">Geç (tek ders dahil)</div>
          <div className="mt-1 text-2xl font-semibold">{lateEquivalent}</div>
        </div>
        {STATUSES.filter((status) => status !== "LATE").map((status) => (
          <div key={status} className="card p-4">
            <div className="text-xs text-gray-500">{STATUS_LABELS[status]} (ders)</div>
            <div className="mt-1 text-2xl font-semibold">{counts.get(status)}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        <section className="card h-fit overflow-x-auto">
          <h2 className="px-5 pt-4 pb-2 font-semibold">Devamsızlık geçmişi</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Yoklama</th>
                <th>Durum</th>
                <th>Açıklama</th>
                <th>Veli bilgilendirme</th>
              </tr>
            </thead>
            <tbody>
              {enrollment.attendanceRecords.map((record) => (
                <tr key={record.id}>
                  <td className="whitespace-nowrap">{formatDate(record.date)}</td>
                  <td className="whitespace-nowrap">{record.lessonPeriod?.name ?? "Günlük"}</td>
                  <td><span className={`badge ${STATUS_COLORS[record.status]}`}>{STATUS_LABELS[record.status]}</span></td>
                  <td className="text-gray-700">{record.note}</td>
                  <td>
                    <div className="space-y-1">
                      {record.contactLogs.map((log) => (
                        <div key={log.id} className="flex flex-wrap items-center gap-1.5">
                          <span className={`badge ${CONTACT_COLORS[log.result]}`}>{CONTACT_LABELS[log.result]}</span>
                          {log.guardian && <span className="text-xs text-gray-500">{fullName(log.guardian)}</span>}
                          {log.note && <span className="text-xs text-gray-700">{log.note}</span>}
                          <span className="text-xs text-gray-400">{log.user.fullName} · {formatDateTime(log.createdAt)}</span>
                        </div>
                      ))}
                      {record.contactLogs.length === 0 && <span className="text-xs text-orange-600">Bilgilendirme yok</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {enrollment.attendanceRecords.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-gray-500">Devamsızlık kaydı yok.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="mb-4 font-semibold">Öğrenci bilgileri</h2>
            <StudentForm enrollment={enrollment} classGroups={classGroups} />
          </section>

          <section className="card space-y-4 p-5">
            <h2 className="font-semibold">Veliler</h2>
            {guardians.map((link) => (
              <GuardianForm
                key={link.id}
                studentId={enrollment.studentId}
                link={{
                  guardianId: link.guardianId,
                  relation: link.relation,
                  contactOrder: link.contactOrder,
                  receivesSms: link.receivesSms,
                  guardian: {
                    firstName: link.guardian.firstName,
                    lastName: link.guardian.lastName,
                    phone: link.guardian.phone,
                    nationalId: link.guardian.nationalId,
                  },
                }}
              />
            ))}
            <details className="rounded-lg border border-dashed border-gray-300 p-3">
              <summary className="cursor-pointer text-sm font-medium text-indigo-600">Veli ekle</summary>
              <div className="mt-3">
                <GuardianForm key={`new-${guardians.length}`} studentId={enrollment.studentId} />
              </div>
            </details>
          </section>
        </div>
      </div>
    </div>
  );
}
