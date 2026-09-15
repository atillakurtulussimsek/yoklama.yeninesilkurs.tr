import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/context";
import { classLabel, compareClassGroups } from "@/lib/classGroups";
import { addDays, formatDate, formatDateLong, fromDbDate, toDbDate, todayStr } from "@/lib/dates";
import { findChronicStudents } from "@/lib/chronic";
import { STATUSES, STATUS_COLORS, STATUS_LABELS } from "@/lib/labels";
import { formatDays } from "@/lib/dayAbsence";

export default async function DashboardPage() {
  const { branch, academicYear } = await requireContext();
  const scope = { branchId: branch.id, academicYearId: academicYear.id };
  const today = todayStr();
  const date = toDbDate(today);
  const trendStart = addDays(today, -13);

  const [records, classGroups, sessions, chronic, trendRows] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { date, enrollment: scope },
      select: { status: true, enrollmentId: true, _count: { select: { contactLogs: true } } },
    }),
    prisma.classGroup.findMany({
      where: { ...scope, isActive: true },
      select: { id: true, gradeLevel: true, name: true, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
    }),
    prisma.attendanceSession.findMany({
      where: { date, classGroup: scope },
      select: { classGroupId: true },
      distinct: ["classGroupId"],
    }),
    findChronicStudents(branch.id, academicYear.id, today),
    prisma.attendanceRecord.groupBy({
      by: ["date"],
      where: { date: { gte: toDbDate(trendStart), lte: date }, status: "ABSENT", enrollment: scope },
      _count: { _all: true },
    }),
  ]);

  const statusCounts = new Map(STATUSES.map((status) => [status, new Set<number>()]));
  const contacted = new Map<number, boolean>();
  for (const record of records) {
    statusCounts.get(record.status)!.add(record.enrollmentId);
    contacted.set(record.enrollmentId, (contacted.get(record.enrollmentId) ?? false) || record._count.contactLogs > 0);
  }
  const pendingCount = [...contacted.values()].filter((value) => !value).length;

  const takenIds = new Set(sessions.map((session) => session.classGroupId));
  const missingClasses = classGroups
    .filter((group) => group._count.enrollments > 0 && !takenIds.has(group.id))
    .sort(compareClassGroups);

  const trendMap = new Map(trendRows.map((row) => [fromDbDate(row.date), row._count._all]));
  const trend = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(trendStart, i);
    return { day, count: trendMap.get(day) ?? 0 };
  });
  const trendMax = Math.max(1, ...trend.map((item) => item.count));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Özet</h1>
        <p className="text-sm text-gray-500">
          {branch.name} · {academicYear.name} · {formatDateLong(today)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {STATUSES.map((status) => (
          <div key={status} className="card p-4">
            <div className="text-xs text-gray-500">{STATUS_LABELS[status]}</div>
            <div className="mt-1 text-2xl font-semibold">{statusCounts.get(status)!.size}</div>
          </div>
        ))}
        <Link href="/veli-bilgilendirme" className="card border-orange-200 bg-orange-50 p-4 hover:bg-orange-100">
          <div className="text-xs text-orange-700">Veliye ulaşılmayı bekleyen</div>
          <div className="mt-1 text-2xl font-semibold text-orange-800">{pendingCount}</div>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Bugün yoklaması alınmayan sınıflar</h2>
            <Link href="/yoklama" className="text-sm text-indigo-600 hover:underline">Yoklama al</Link>
          </div>
          {classGroups.length === 0 ? (
            <p className="text-sm text-gray-500">
              Henüz öğrenci yok. <Link href="/ogrenciler/ice-aktar" className="text-indigo-600 hover:underline">Excel&apos;den aktarın</Link>.
            </p>
          ) : missingClasses.length === 0 ? (
            <p className="text-sm text-emerald-700">Tüm sınıfların yoklaması alındı.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {missingClasses.map((group) => (
                <Link
                  key={group.id}
                  href={`/yoklama?sinif=${group.id}`}
                  className="badge bg-gray-50 text-gray-700 ring-gray-200 hover:bg-indigo-50"
                >
                  {classLabel(group)}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Son 14 gün – gelmeyen öğrenci kaydı</h2>
          <div className="flex h-36 items-end gap-1.5">
            {trend.map((item) => (
              <div key={item.day} className="flex flex-1 flex-col items-center gap-1" title={`${formatDate(item.day)}: ${item.count}`}>
                <span className="text-[10px] text-gray-500">{item.count || ""}</span>
                <div
                  className="w-full rounded-t bg-indigo-500"
                  style={{ height: `${(item.count / trendMax) * 100}px`, minHeight: item.count ? 4 : 1 }}
                />
                <span className="text-[10px] text-gray-400">{item.day.slice(8)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="font-semibold">Sürekli devamsızlar</h2>
            <p className="text-xs text-gray-500">
              Son {chronic.settings.windowDays} gün · {chronic.settings.absenceThreshold}+ gün veya{" "}
              {chronic.settings.consecutiveThreshold}+ gün üst üste
            </p>
          </div>
          <Link href="/raporlar/surekli-devamsiz" className="text-sm text-indigo-600 hover:underline">Tümü</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Ad Soyad</th>
                <th>Sınıf</th>
                <th>Devamsız gün</th>
                <th>Üst üste</th>
                <th>Son devamsızlık</th>
              </tr>
            </thead>
            <tbody>
              {chronic.students.slice(0, 8).map((student) => (
                <tr key={student.id}>
                  <td>{student.studentNo}</td>
                  <td>
                    <Link href={`/ogrenciler/${student.id}`} className="font-medium hover:text-indigo-600">
                      {student.fullName}
                    </Link>
                  </td>
                  <td>{student.className}</td>
                  <td><span className={`badge ${STATUS_COLORS.ABSENT}`}>{formatDays(student.absentDays)}</span></td>
                  <td>{student.maxConsecutive}</td>
                  <td>{formatDate(student.lastAbsentDate)}</td>
                </tr>
              ))}
              {chronic.students.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-gray-500">Kritere uyan öğrenci yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
