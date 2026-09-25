import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/context";
import { classLabel, compareClassGroups, fullName } from "@/lib/classGroups";
import { formatDate, formatDateLong, fromDbDate } from "@/lib/dates";
import { formatGuardianShort } from "@/lib/dailyAbsenceReport";
import { RELATION_LABELS, STATUS_COLORS, STATUS_LABELS } from "@/lib/labels";
import { formatPhone, sortGuardianLinks } from "@/lib/phone";
import { getClassGroupOptions } from "@/lib/reports";
import ContactPanel from "@/app/(app)/veli-bilgilendirme/ContactPanel";
import ExamForm from "../ExamForm";
import DeleteExamButton from "./DeleteExamButton";
import ExamAttendanceForm from "./ExamAttendanceForm";

export default async function ExamDetailPage({ params, searchParams }: PageProps<"/sinavlar/[id]">) {
  const { user, branch, academicYear } = await requireContext();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const query = await searchParams;
  const classFilter = Number(query.sinif) || 0;

  const [exam, classGroups] = await Promise.all([
    prisma.exam.findFirst({
      where: { id, branchId: branch.id, academicYearId: academicYear.id },
      include: {
        classGroups: { select: { classGroupId: true } },
        sessions: { select: { classGroupId: true, updatedAt: true } },
        attendances: {
          include: {
            enrollment: {
              select: {
                id: true,
                studentNo: true,
                classGroup: { select: { gradeLevel: true, name: true } },
                student: { select: { firstName: true, lastName: true, guardians: { include: { guardian: true } } } },
              },
            },
            contactLogs: {
              include: { user: { select: { fullName: true } }, guardian: { select: { firstName: true, lastName: true } } },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    }),
    getClassGroupOptions(branch.id, academicYear.id),
  ]);
  if (!exam) notFound();

  const scopedIds = exam.classGroups.map((item) => item.classGroupId);
  const examGroups = scopedIds.length ? classGroups.filter((g) => scopedIds.includes(g.id)) : classGroups;
  // Seçili şubelerin bazıları artık boş olabilir (yeni öğrenci aktarımından sonra)
  const emptyScopedCount = scopedIds.length - examGroups.length;
  const listGroupIds = classFilter && examGroups.some((g) => g.id === classFilter) ? [classFilter] : examGroups.map((g) => g.id);

  const enrollments = await prisma.studentEnrollment.findMany({
    where: { branchId: branch.id, academicYearId: academicYear.id, status: "ACTIVE", classGroupId: { in: listGroupIds } },
    select: { id: true, studentNo: true, classGroup: { select: { gradeLevel: true, name: true } }, student: { select: { firstName: true, lastName: true } } },
  });
  enrollments.sort((a, b) => compareClassGroups(a.classGroup, b.classGroup) || fullName(a.student).localeCompare(fullName(b.student), "tr-TR"));
  const students = enrollments.map((e) => ({ id: e.id, studentNo: e.studentNo, fullName: fullName(e.student), className: classLabel(e.classGroup) }));

  const takenIds = new Set(exam.sessions.map((s) => s.classGroupId));
  const absentees = [...exam.attendances].sort(
    (a, b) => compareClassGroups(a.enrollment.classGroup, b.enrollment.classGroup) || fullName(a.enrollment.student).localeCompare(fullName(b.enrollment.student), "tr-TR"),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/sinavlar" className="text-sm text-gray-500 hover:text-indigo-600">← Deneme Sınavları</Link>
          <h1 className="text-2xl font-semibold">{exam.name}</h1>
          <p className="text-sm text-gray-500">{formatDateLong(exam.date)} · {examGroups.map((g) => g.label).join(", ")}</p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/rapor/sinav/${exam.id}`} className="btn-secondary">Excel indir</a>
          {user.role === "ADMIN" && <DeleteExamButton id={exam.id} />}
        </div>
      </div>

      {emptyScopedCount > 0 && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Bu sınav için seçilen {emptyScopedCount} şubede artık aktif öğrenci yok (öğrenci listesi yenilenmiş olabilir). Aşağıdaki
          &quot;Sınav bilgileri&quot; bölümünden şubeleri güncelleyin.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {examGroups.map((group) => (
          <Link
            key={group.id}
            href={`/sinavlar/${exam.id}?sinif=${group.id}`}
            className={`badge ${takenIds.has(group.id) ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : "bg-gray-100 text-gray-600 ring-gray-200"} ${classFilter === group.id ? "ring-2 ring-indigo-500" : ""}`}
            title={takenIds.has(group.id) ? "Yoklama alındı" : "Yoklama alınmadı"}
          >
            {group.label}
          </Link>
        ))}
        {classFilter > 0 && <Link href={`/sinavlar/${exam.id}`} className="badge bg-white text-gray-600 ring-gray-200">Tümü</Link>}
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Sınav yoklaması</h2>
        <p className="text-sm text-gray-500">Varsayılan &quot;Katıldı&quot;; yalnızca katılmayan, geç kalan veya mazeretli öğrencileri işaretleyin.</p>
        {students.length === 0 ? (
          <div className="card p-6 text-center text-sm text-gray-500">
            {examGroups.length === 0 ? "Seçili şubelerde aktif öğrenci yok; sınav bilgilerinden şubeleri güncelleyin." : "Bu şubede öğrenci yok."}
          </div>
        ) : (
          <ExamAttendanceForm
            key={`${exam.id}-${classFilter}`}
            examId={exam.id}
            students={students}
            initialRecords={exam.attendances
              .filter((a) => students.some((s) => s.id === a.enrollmentId))
              .map((a) => ({ enrollmentId: a.enrollmentId, status: a.status, note: a.note }))}
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Katılmayanlar ve veli bilgilendirme ({absentees.length})</h2>
        {absentees.length === 0 ? (
          <div className="card p-6 text-center text-sm text-gray-500">İşaretli öğrenci yok.</div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {absentees.map((item) => {
              const guardians = sortGuardianLinks(item.enrollment.student.guardians);
              return (
                <div key={item.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link href={`/ogrenciler/${item.enrollment.id}`} className="font-semibold hover:text-indigo-600">{fullName(item.enrollment.student)}</Link>
                      <div className="text-xs text-gray-500">No {item.enrollment.studentNo} · {classLabel(item.enrollment.classGroup)}</div>
                      <span className={`badge mt-1 ${STATUS_COLORS[item.status]}`}>
                        {item.status === "ABSENT" ? "Katılmadı" : STATUS_LABELS[item.status]}{item.note ? ` – ${item.note}` : ""}
                      </span>
                    </div>
                    <div className="text-right text-xs">
                      {guardians.map((link) => (
                        <div key={link.id}>
                          <span className="text-gray-500">{RELATION_LABELS[link.relation]} {link.guardian.firstName}: </span>
                          {link.guardian.phone ? (
                            <a href={`tel:${link.guardian.phone}`} className="font-medium text-indigo-600 hover:underline">{formatPhone(link.guardian.phone)}</a>
                          ) : (
                            <span className="text-red-600">tel yok</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <ContactPanel
                    examAttendanceIds={[item.id]}
                    guardians={guardians.map((link) => ({ id: link.guardian.id, label: formatGuardianShort({ relation: link.relation, firstName: link.guardian.firstName }) }))}
                    logs={item.contactLogs.map((log) => ({
                      id: log.id,
                      result: log.result,
                      note: log.note,
                      guardianName: log.guardian ? fullName(log.guardian) : null,
                      userName: log.user.fullName,
                      createdAt: log.createdAt.toISOString(),
                      canDelete: user.role === "ADMIN" || log.userId === user.id,
                    }))}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-4 font-semibold">Sınav bilgileri</h2>
        <ExamForm
          exam={{ id: exam.id, name: exam.name, date: fromDbDate(exam.date), note: exam.note, classGroupIds: scopedIds }}
          classGroups={classGroups}
        />
        <p className="mt-2 text-xs text-gray-400">Oluşturulma: {formatDate(exam.createdAt)}</p>
      </section>
    </div>
  );
}
