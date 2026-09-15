import "server-only";
import { prisma } from "@/lib/db";
import { classLabel, fullName } from "@/lib/classGroups";
import { addDays, fromDbDate, toDbDate, todayStr } from "@/lib/dates";
import { summarizeDay, type DayRecord } from "@/lib/dayAbsence";
import { primaryPhone } from "@/lib/phone";
import { getChronicSettings } from "@/lib/settings";

export type ChronicStudent = {
  id: number;
  studentNo: number;
  fullName: string;
  className: string;
  parentPhone: string | null;
  /** Toplam devamsız gün (yarım günler 0,5) */
  absentDays: number;
  lateCount: number;
  maxConsecutive: number;
  currentConsecutive: number;
  lastAbsentDate: string;
  reasons: string[];
};

/**
 * Sürekli devamsız öğrencileri bulur (id = kayıt/enrollment id).
 * Gün hesabı summarizeDay kuralıyla yapılır; ardışık gün, sınıf için yoklama alınan günler üzerinden sayılır.
 */
export async function findChronicStudents(branchId: number, academicYearId: number, endDate = todayStr()) {
  const settings = await getChronicSettings(branchId);
  const startDate = addDays(endDate, -(settings.windowDays - 1));
  const range = { gte: toDbDate(startDate), lte: toDbDate(endDate) };

  const [records, sessions, lessons] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { date: range, enrollment: { branchId, academicYearId, status: "ACTIVE" } },
      select: {
        date: true,
        slot: true,
        status: true,
        enrollment: {
          select: {
            id: true,
            studentNo: true,
            classGroupId: true,
            classGroup: { select: { gradeLevel: true, name: true } },
            student: {
              select: {
                firstName: true,
                lastName: true,
                guardians: { select: { contactOrder: true, guardian: { select: { phone: true } } } },
              },
            },
          },
        },
      },
    }),
    prisma.attendanceSession.findMany({
      where: { date: range, classGroup: { branchId, academicYearId } },
      select: { date: true, slot: true, classGroupId: true },
    }),
    prisma.lessonPeriod.findMany({ where: { branchId }, select: { id: true, session: true } }),
  ]);
  const sessionOf = new Map(lessons.map((lesson) => [lesson.id, lesson.session]));

  // Sınıf+gün → yoklama alınan slotlar
  const takenSlots = new Map<string, Set<number>>();
  for (const session of sessions) {
    const key = `${session.classGroupId}|${fromDbDate(session.date)}`;
    const set = takenSlots.get(key) ?? new Set<number>();
    set.add(session.slot);
    takenSlots.set(key, set);
  }

  type Acc = { enrollment: (typeof records)[number]["enrollment"]; byDay: Map<string, DayRecord[]> };
  const byEnrollment = new Map<number, Acc>();
  for (const record of records) {
    const acc = byEnrollment.get(record.enrollment.id) ?? { enrollment: record.enrollment, byDay: new Map() };
    const day = fromDbDate(record.date);
    const list = acc.byDay.get(day) ?? [];
    list.push({ slot: record.slot, status: record.status });
    acc.byDay.set(day, list);
    byEnrollment.set(record.enrollment.id, acc);
  }

  const result: ChronicStudent[] = [];
  for (const { enrollment, byDay } of byEnrollment.values()) {
    const dayValues = new Map<string, number>();
    let lateCount = 0;
    for (const [day, dayRecords] of byDay) {
      const taken = takenSlots.get(`${enrollment.classGroupId}|${day}`) ?? new Set<number>();
      const summary = summarizeDay(dayRecords, taken, sessionOf);
      lateCount += summary.lateCount;
      if (summary.days > 0) dayValues.set(day, summary.days);
    }
    if (dayValues.size === 0) continue;

    const absentDays = [...dayValues.values()].reduce((sum, value) => sum + value, 0);

    // Ardışık gün: sınıf için yoklama alınan günler dizisinde kesintisiz devamsız günler
    const classDays = new Set<string>();
    for (const key of takenSlots.keys()) {
      const [groupId, day] = key.split("|");
      if (Number(groupId) === enrollment.classGroupId) classDays.add(day);
    }
    const timeline = [...new Set([...classDays, ...dayValues.keys()])].sort();
    let run = 0;
    let maxConsecutive = 0;
    for (const day of timeline) {
      run = dayValues.has(day) ? run + 1 : 0;
      maxConsecutive = Math.max(maxConsecutive, run);
    }

    const reasons: string[] = [];
    if (absentDays >= settings.absenceThreshold) {
      reasons.push(`Son ${settings.windowDays} günde ${formatDaysText(absentDays)} gün devamsız`);
    }
    if (maxConsecutive >= settings.consecutiveThreshold) {
      reasons.push(`${maxConsecutive} gün üst üste devamsız`);
    }
    if (reasons.length === 0) continue;

    result.push({
      id: enrollment.id,
      studentNo: enrollment.studentNo,
      fullName: fullName(enrollment.student),
      className: classLabel(enrollment.classGroup),
      parentPhone: primaryPhone(enrollment.student.guardians),
      absentDays,
      lateCount,
      maxConsecutive,
      currentConsecutive: run,
      lastAbsentDate: [...dayValues.keys()].sort().at(-1)!,
      reasons,
    });
  }

  result.sort((a, b) => b.absentDays - a.absentDays || b.maxConsecutive - a.maxConsecutive);
  return { settings, startDate, endDate, students: result };
}

function formatDaysText(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
}
