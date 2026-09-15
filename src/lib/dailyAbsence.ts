import "server-only";
import { prisma } from "@/lib/db";
import { fromDbDate } from "@/lib/dates";
import { summarizeDay, type DayRecord } from "@/lib/dayAbsence";
import { STATUS_LABELS } from "@/lib/labels";
import type { DailyAbsenceKind, DaySession } from "@/generated/prisma/enums";

export { DAILY_KIND_COLORS, DAILY_KIND_LABELS, DAILY_KINDS } from "@/lib/dailyLabels";

/**
 * Verilen kayıtların (enrollment) belirli günlerdeki günlük devamsızlıklarını ders kayıtlarından yeniden türetir.
 * Elle düzenlenmiş (manual) satırların türü korunur, yalnızca otomatik olanlar güncellenir; açıklama her zaman korunur.
 */
export async function recomputeDailyAbsences(enrollmentIds: number[], dates: Date[]) {
  if (enrollmentIds.length === 0 || dates.length === 0) return;

  const [records, enrollments, existing] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { enrollmentId: { in: enrollmentIds }, date: { in: dates } },
      select: { enrollmentId: true, date: true, slot: true, status: true, note: true, lessonPeriod: { select: { orderNo: true, name: true } } },
    }),
    prisma.studentEnrollment.findMany({
      where: { id: { in: enrollmentIds } },
      select: { id: true, classGroupId: true, branchId: true },
    }),
    prisma.dailyAbsence.findMany({ where: { enrollmentId: { in: enrollmentIds }, date: { in: dates } } }),
  ]);
  const branchIds = [...new Set(enrollments.map((e) => e.branchId))];
  const classGroupIds = [...new Set(enrollments.map((e) => e.classGroupId).filter((id): id is number => id !== null))];
  const [sessions, lessons] = await Promise.all([
    prisma.attendanceSession.findMany({
      where: { classGroupId: { in: classGroupIds }, date: { in: dates } },
      select: { classGroupId: true, date: true, slot: true },
    }),
    prisma.lessonPeriod.findMany({ where: { branchId: { in: branchIds } }, select: { id: true, session: true } }),
  ]);
  const sessionOf = new Map(lessons.map((lesson) => [lesson.id, lesson.session]));
  const takenSlots = new Map<string, Set<number>>();
  for (const session of sessions) {
    const key = `${session.classGroupId}|${fromDbDate(session.date)}`;
    takenSlots.set(key, new Set([...(takenSlots.get(key) ?? []), session.slot]));
  }
  const classOf = new Map(enrollments.map((e) => [e.id, e.classGroupId]));
  const existingMap = new Map(existing.map((row) => [`${row.enrollmentId}|${fromDbDate(row.date)}`, row]));

  type Rec = (typeof records)[number];
  const grouped = new Map<string, Rec[]>();
  for (const record of records) {
    const key = `${record.enrollmentId}|${fromDbDate(record.date)}`;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }

  const ops = [];
  for (const enrollmentId of enrollmentIds) {
    for (const date of dates) {
      const day = fromDbDate(date);
      const key = `${enrollmentId}|${day}`;
      const dayRecords = grouped.get(key) ?? [];
      const current = existingMap.get(key);
      const summary = summarizeDay(
        dayRecords.map((r): DayRecord => ({ slot: r.slot, status: r.status })),
        takenSlots.get(`${classOf.get(enrollmentId)}|${day}`) ?? [],
        sessionOf,
      );

      const derived = deriveKind(summary, dayRecords, sessionOf);
      if (!derived) {
        if (current && !current.manual) ops.push(prisma.dailyAbsence.delete({ where: { id: current.id } }));
        continue;
      }
      const detail = buildDetail(dayRecords);
      if (current) {
        ops.push(
          prisma.dailyAbsence.update({
            where: { id: current.id },
            data: current.manual ? { detail, lateCount: summary.lateCount } : { ...derived, detail, lateCount: summary.lateCount },
          }),
        );
      } else {
        ops.push(prisma.dailyAbsence.create({ data: { enrollmentId, date, ...derived, detail, lateCount: summary.lateCount } }));
      }
    }
  }
  if (ops.length) await prisma.$transaction(ops);
}

type Summary = ReturnType<typeof summarizeDay>;

function deriveKind(
  summary: Summary,
  records: { slot: number; status: string }[],
  sessionOf: Map<number, DaySession>,
): { kind: DailyAbsenceKind; days: number; session: DaySession | null } | null {
  if (summary.days > 0) {
    const absentRecords = records.filter((r) => r.status === "ABSENT" || r.status === "EXCUSED");
    const allExcused = absentRecords.length > 0 && absentRecords.every((r) => r.status === "EXCUSED");
    let session: DaySession | null = null;
    if (summary.days === 0.5) {
      const sessions = new Set(absentRecords.map((r) => (r.slot === 0 ? null : (sessionOf.get(r.slot) ?? "MORNING"))));
      session = sessions.size === 1 ? [...sessions][0] : null;
    }
    return { kind: allExcused ? "EXCUSED" : summary.days === 1 ? "FULL_DAY" : "HALF_DAY", days: summary.days, session };
  }
  if (summary.lateCount > 0) return { kind: "LATE", days: 0, session: null };
  return null;
}

function buildDetail(records: { slot: number; status: "ABSENT" | "LATE" | "EARLY_LEAVE" | "EXCUSED"; note: string | null; lessonPeriod: { orderNo: number; name: string } | null }[]) {
  const parts = records
    .sort((a, b) => (a.lessonPeriod?.orderNo ?? 0) - (b.lessonPeriod?.orderNo ?? 0))
    .map((r) => `${r.lessonPeriod ? `${r.lessonPeriod.orderNo}. ders` : "Günlük"}: ${STATUS_LABELS[r.status]}${r.note ? ` (${r.note})` : ""}`);
  return parts.join(", ").slice(0, 255) || null;
}
