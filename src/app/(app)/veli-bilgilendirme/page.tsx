import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/context";
import { classLabel, compareClassGroups, fullName } from "@/lib/classGroups";
import { formatDateLong, isDateStr, toDbDate, todayStr } from "@/lib/dates";
import { formatPhone, sortGuardianLinks } from "@/lib/phone";
import { RELATION_LABELS, STATUS_COLORS, STATUS_LABELS } from "@/lib/labels";
import ContactPanel from "./ContactPanel";

export default async function ParentContactPage({ searchParams }: PageProps<"/veli-bilgilendirme">) {
  const { user, branch, academicYear } = await requireContext();
  const params = await searchParams;
  const date = isDateStr(params.tarih) ? params.tarih : todayStr();
  const showAll = params.filtre === "tumu";

  const records = await prisma.attendanceRecord.findMany({
    where: { date: toDbDate(date), enrollment: { branchId: branch.id, academicYearId: academicYear.id } },
    include: {
      enrollment: {
        include: {
          classGroup: { select: { gradeLevel: true, name: true } },
          student: { include: { guardians: { include: { guardian: true } } } },
        },
      },
      lessonPeriod: { select: { name: true } },
      contactLogs: {
        include: { user: { select: { fullName: true } }, guardian: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Aynı günün deneme sınavı devamsızlıkları da veli bilgilendirmesine dahil
  const examItems = await prisma.examAttendance.findMany({
    where: { exam: { date: toDbDate(date), branchId: branch.id, academicYearId: academicYear.id } },
    include: {
      exam: { select: { id: true, name: true } },
      enrollment: {
        include: {
          classGroup: { select: { gradeLevel: true, name: true } },
          student: { include: { guardians: { include: { guardian: true } } } },
        },
      },
      contactLogs: {
        include: { user: { select: { fullName: true } }, guardian: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  const examList = examItems.sort(
    (a, b) =>
      compareClassGroups(a.enrollment.classGroup, b.enrollment.classGroup) ||
      fullName(a.enrollment.student).localeCompare(fullName(b.enrollment.student), "tr-TR"),
  );
  const examPending = examList.filter((item) => item.contactLogs.length === 0);
  const examShown = showAll ? examList : examPending;

  type Group = { enrollment: (typeof records)[number]["enrollment"]; records: typeof records };
  const groups = new Map<number, Group>();
  for (const record of records) {
    const group = groups.get(record.enrollmentId) ?? { enrollment: record.enrollment, records: [] };
    group.records.push(record);
    groups.set(record.enrollmentId, group);
  }

  const allGroups = [...groups.values()].sort(
    (a, b) =>
      compareClassGroups(a.enrollment.classGroup, b.enrollment.classGroup) ||
      fullName(a.enrollment.student).localeCompare(fullName(b.enrollment.student), "tr-TR"),
  );
  const pendingGroups = allGroups.filter((group) => group.records.every((record) => record.contactLogs.length === 0));
  const list = showAll ? allGroups : pendingGroups;

  const filterLink = (filtre: string) => `/veli-bilgilendirme?tarih=${date}&filtre=${filtre}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Veli Bilgilendirme</h1>
        <p className="text-sm text-gray-500">{formatDateLong(date)}</p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex items-end gap-2">
          <div>
            <label className="label" htmlFor="tarih">Tarih</label>
            <input className="input" type="date" id="tarih" name="tarih" defaultValue={date} />
          </div>
          <input type="hidden" name="filtre" value={showAll ? "tumu" : "bekleyen"} />
          <button className="btn-secondary">Getir</button>
        </form>
        <div className="flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm">
          <Link
            href={filterLink("bekleyen")}
            className={`rounded-md px-3 py-1.5 ${!showAll ? "bg-indigo-600 text-white" : "text-gray-600"}`}
          >
            Bekleyen ({pendingGroups.length + examPending.length})
          </Link>
          <Link
            href={filterLink("tumu")}
            className={`rounded-md px-3 py-1.5 ${showAll ? "bg-indigo-600 text-white" : "text-gray-600"}`}
          >
            Tümü ({allGroups.length + examList.length})
          </Link>
        </div>
      </div>

      {list.length === 0 && examShown.length === 0 ? (
        <div className="card p-8 text-center text-sm text-gray-500">
          {allGroups.length === 0 && examList.length === 0 ? "Bu tarihte devamsızlık kaydı yok." : "Bekleyen veli bilgilendirmesi yok."}
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {list.map(({ enrollment, records: studentRecords }) => {
            const guardians = sortGuardianLinks(enrollment.student.guardians);
            const logs = studentRecords
              .flatMap((record) => record.contactLogs)
              .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            // Aynı bildirim birden fazla kayda eklenmiş olabilir; tekrarları göstermemek için birleştir
            const uniqueLogs = logs.filter(
              (log, index) =>
                index === 0 ||
                !(
                  log.result === logs[index - 1].result &&
                  log.note === logs[index - 1].note &&
                  log.guardianId === logs[index - 1].guardianId &&
                  Math.abs(log.createdAt.getTime() - logs[index - 1].createdAt.getTime()) < 2000
                ),
            );
            return (
              <div key={enrollment.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/ogrenciler/${enrollment.id}`} className="font-semibold hover:text-indigo-600">
                      {fullName(enrollment.student)}
                    </Link>
                    <div className="text-xs text-gray-500">
                      No {enrollment.studentNo} · {classLabel(enrollment.classGroup)}
                    </div>
                  </div>
                  <div className="space-y-0.5 text-right text-sm">
                    {guardians.map((link) => (
                      <div key={link.id}>
                        <span className="text-gray-500">
                          {RELATION_LABELS[link.relation]} {link.guardian.firstName}:{" "}
                        </span>
                        {link.guardian.phone ? (
                          <a href={`tel:${link.guardian.phone}`} className="font-medium text-indigo-600 hover:underline">
                            {formatPhone(link.guardian.phone)}
                          </a>
                        ) : (
                          <span className="text-xs text-red-600">tel yok</span>
                        )}
                      </div>
                    ))}
                    {guardians.length === 0 && <span className="text-xs text-red-600">Veli kayıtlı değil</span>}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {studentRecords
                    .sort((a, b) => a.slot - b.slot)
                    .map((record) => (
                      <span key={record.id} className={`badge ${STATUS_COLORS[record.status]}`}>
                        {record.lessonPeriod ? `${record.lessonPeriod.name}: ` : ""}
                        {STATUS_LABELS[record.status]}
                        {record.note ? ` – ${record.note}` : ""}
                      </span>
                    ))}
                </div>

                <ContactPanel
                  recordIds={studentRecords.map((record) => record.id)}
                  guardians={guardians.map((link) => ({
                    id: link.guardian.id,
                    label: `${RELATION_LABELS[link.relation]} (${link.guardian.firstName})`,
                  }))}
                  logs={uniqueLogs.map((log) => ({
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

      {examShown.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Deneme sınavı devamsızlıkları ({examShown.length})</h2>
          <div className="grid gap-3 xl:grid-cols-2">
            {examShown.map((item) => {
              const guardians = sortGuardianLinks(item.enrollment.student.guardians);
              return (
                <div key={item.id} className="card border-violet-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link href={`/ogrenciler/${item.enrollment.id}`} className="font-semibold hover:text-indigo-600">
                        {fullName(item.enrollment.student)}
                      </Link>
                      <div className="text-xs text-gray-500">
                        No {item.enrollment.studentNo} · {classLabel(item.enrollment.classGroup)}
                      </div>
                    </div>
                    <div className="space-y-0.5 text-right text-sm">
                      {guardians.map((link) => (
                        <div key={link.id}>
                          <span className="text-gray-500">{RELATION_LABELS[link.relation]} {link.guardian.firstName}: </span>
                          {link.guardian.phone ? (
                            <a href={`tel:${link.guardian.phone}`} className="font-medium text-indigo-600 hover:underline">
                              {formatPhone(link.guardian.phone)}
                            </a>
                          ) : (
                            <span className="text-xs text-red-600">tel yok</span>
                          )}
                        </div>
                      ))}
                      {guardians.length === 0 && <span className="text-xs text-red-600">Veli kayıtlı değil</span>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Link href={`/sinavlar/${item.exam.id}`} className="badge bg-violet-50 text-violet-800 ring-violet-200 hover:bg-violet-100">
                      Sınav: {item.exam.name}
                    </Link>
                    <span className={`badge ${STATUS_COLORS[item.status]}`}>
                      {item.status === "ABSENT" ? "Katılmadı" : STATUS_LABELS[item.status]}
                      {item.note ? ` – ${item.note}` : ""}
                    </span>
                  </div>
                  <ContactPanel
                    examAttendanceIds={[item.id]}
                    guardians={guardians.map((link) => ({ id: link.guardian.id, label: `${RELATION_LABELS[link.relation]} (${link.guardian.firstName})` }))}
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
        </section>
      )}
    </div>
  );
}
