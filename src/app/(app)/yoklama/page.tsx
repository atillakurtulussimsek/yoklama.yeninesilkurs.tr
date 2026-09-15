import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/context";
import { classLabel, compareClassGroups, fullName } from "@/lib/classGroups";
import { formatDateTime, isDateStr, toDbDate, todayStr } from "@/lib/dates";
import { getClassGroupOptions } from "@/lib/reports";
import AttendanceForm from "./AttendanceForm";

export default async function AttendancePage({ searchParams }: PageProps<"/yoklama">) {
  const { branch, academicYear } = await requireContext();
  const params = await searchParams;
  const date = isDateStr(params.tarih) ? params.tarih : todayStr();
  const slot = Number(params.ders) || 0;
  const classGroupId = Number(params.sinif) || 0;

  const [lessons, classGroups] = await Promise.all([
    prisma.lessonPeriod.findMany({ where: { branchId: branch.id, isActive: true }, orderBy: { orderNo: "asc" } }),
    getClassGroupOptions(branch.id, academicYear.id),
  ]);
  const validSlot = slot === 0 || lessons.some((lesson) => lesson.id === slot) ? slot : 0;
  const validClassId = classGroups.some((group) => group.id === classGroupId) ? classGroupId : 0;

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      branchId: branch.id,
      academicYearId: academicYear.id,
      status: "ACTIVE",
      ...(validClassId ? { classGroupId: validClassId } : {}),
    },
    select: {
      id: true,
      studentNo: true,
      classGroup: { select: { gradeLevel: true, name: true } },
      student: { select: { firstName: true, lastName: true } },
    },
  });
  enrollments.sort(
    (a, b) =>
      compareClassGroups(a.classGroup, b.classGroup) || fullName(a.student).localeCompare(fullName(b.student), "tr-TR"),
  );
  const students = enrollments.map((enrollment) => ({
    id: enrollment.id,
    studentNo: enrollment.studentNo,
    fullName: fullName(enrollment.student),
    className: classLabel(enrollment.classGroup),
  }));

  const [records, sessions] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { date: toDbDate(date), slot: validSlot, enrollmentId: { in: students.map((s) => s.id) } },
      select: { enrollmentId: true, status: true, note: true },
    }),
    prisma.attendanceSession.findMany({
      where: {
        date: toDbDate(date),
        slot: validSlot,
        classGroup: { branchId: branch.id, academicYearId: academicYear.id },
        ...(validClassId ? { classGroupId: validClassId } : {}),
      },
      select: {
        updatedAt: true,
        classGroup: { select: { gradeLevel: true, name: true } },
        takenBy: { select: { fullName: true } },
        teacher: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const takenInfo = sessions
    .sort((a, b) => compareClassGroups(a.classGroup, b.classGroup))
    .map((session) => {
      const who = session.takenBy?.fullName ?? (session.teacher ? `${fullName(session.teacher)} (Telegram)` : "-");
      return `${classLabel(session.classGroup)} (${who}, ${formatDateTime(session.updatedAt)})`;
    });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Yoklama Al</h1>
        <p className="text-sm text-gray-500">
          Varsayılan durum &quot;Var&quot;dır; yalnızca gelmeyen, geç kalan veya çıkış yapanları işaretleyin.
        </p>
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="tarih">Tarih</label>
          <input className="input" type="date" id="tarih" name="tarih" defaultValue={date} />
        </div>
        <div>
          <label className="label" htmlFor="ders">Yoklama türü</label>
          <select className="input" id="ders" name="ders" defaultValue={validSlot}>
            <option value={0}>Günlük</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.name}{lesson.startTime ? ` (${lesson.startTime})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sinif">Sınıf</label>
          <select className="input" id="sinif" name="sinif" defaultValue={validClassId}>
            <option value={0}>Tüm sınıflar</option>
            {classGroups.map((group) => (
              <option key={group.id} value={group.id}>{group.label}</option>
            ))}
          </select>
        </div>
        <button className="btn-secondary">Getir</button>
      </form>

      {takenInfo.length > 0 && (
        <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Bu yoklama daha önce kaydedildi: {takenInfo.join(", ")}
        </p>
      )}

      {students.length === 0 ? (
        <div className="card p-8 text-center text-sm text-gray-500">Öğrenci bulunamadı.</div>
      ) : (
        <AttendanceForm
          key={`${date}-${validSlot}-${validClassId}`}
          date={date}
          slot={validSlot}
          students={students}
          initialRecords={records.map((record) => ({ studentId: record.enrollmentId, status: record.status, note: record.note }))}
        />
      )}
    </div>
  );
}
