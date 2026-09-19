import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/context";
import { classLabel, compareClassGroups } from "@/lib/classGroups";
import { formatDate } from "@/lib/dates";
import { getClassGroupOptions } from "@/lib/reports";
import ExamForm from "./ExamForm";

export default async function ExamsPage() {
  const { branch, academicYear } = await requireContext();
  const [exams, classGroups, activeCount] = await Promise.all([
    prisma.exam.findMany({
      where: { branchId: branch.id, academicYearId: academicYear.id },
      orderBy: { date: "desc" },
      include: {
        classGroups: { include: { classGroup: { select: { id: true, gradeLevel: true, name: true } } } },
        sessions: { select: { classGroupId: true } },
        attendances: { select: { status: true, _count: { select: { contactLogs: true } } } },
      },
    }),
    getClassGroupOptions(branch.id, academicYear.id),
    prisma.studentEnrollment.groupBy({ by: ["classGroupId"], where: { branchId: branch.id, academicYearId: academicYear.id, status: "ACTIVE" }, _count: { _all: true } }),
  ]);
  const countByClass = new Map(activeCount.map((row) => [row.classGroupId, row._count._all]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Deneme Sınavları</h1>
        <p className="text-sm text-gray-500">
          {branch.name} · {academicYear.name} · Sınav yoklaması günlük devamsızlıktan ayrı tutulur.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Sınav</th>
              <th>Şubeler</th>
              <th>Yoklama</th>
              <th>Katılmadı</th>
              <th>Geç</th>
              <th>Mazeretli</th>
              <th>Veliye ulaşılmayan</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((exam) => {
              const scoped = exam.classGroups.map((item) => item.classGroup).sort(compareClassGroups);
              const expectedGroups = scoped.length ? scoped.map((g) => g.id) : classGroups.map((g) => g.id);
              const expected = expectedGroups.reduce((sum, id) => sum + (countByClass.get(id) ?? 0), 0);
              const taken = new Set(exam.sessions.map((s) => s.classGroupId));
              const takenCount = expectedGroups.filter((id) => taken.has(id)).length;
              const counts = { ABSENT: 0, LATE: 0, EXCUSED: 0, EARLY_LEAVE: 0 };
              let uncontacted = 0;
              for (const item of exam.attendances) {
                counts[item.status]++;
                if (item._count.contactLogs === 0) uncontacted++;
              }
              return (
                <tr key={exam.id}>
                  <td className="whitespace-nowrap">{formatDate(exam.date)}</td>
                  <td>
                    <Link href={`/sinavlar/${exam.id}`} className="font-medium hover:text-indigo-600">{exam.name}</Link>
                    {exam.note && <div className="text-xs text-gray-500">{exam.note}</div>}
                  </td>
                  <td className="text-xs">{scoped.length ? scoped.map(classLabel).join(", ") : "Tüm şubeler"}</td>
                  <td className="whitespace-nowrap text-xs">
                    <span className={takenCount === expectedGroups.length ? "text-emerald-700" : "text-amber-700"}>
                      {takenCount}/{expectedGroups.length} şube
                    </span>
                    <span className="text-gray-400"> · {expected} öğrenci</span>
                  </td>
                  <td>{counts.ABSENT || ""}</td>
                  <td>{counts.LATE || ""}</td>
                  <td>{counts.EXCUSED || ""}</td>
                  <td className={uncontacted ? "text-orange-700" : "text-gray-400"}>{uncontacted || ""}</td>
                </tr>
              );
            })}
            {exams.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-gray-500">Henüz sınav tanımlanmamış.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="card p-5">
        <h2 className="mb-4 font-semibold">Yeni sınav</h2>
        <ExamForm classGroups={classGroups} />
      </section>
    </div>
  );
}
