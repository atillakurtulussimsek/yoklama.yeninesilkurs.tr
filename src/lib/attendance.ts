import "server-only";
import { prisma } from "@/lib/db";
import { recomputeDailyAbsences } from "@/lib/dailyAbsence";
import type { AttendanceStatus } from "@/generated/prisma/enums";

export type AttendanceEntry = { enrollmentId: number; status: AttendanceStatus | null; note?: string };

/** Yoklamayı kaydeden kişi: panel kullanıcısı veya Telegram'dan öğretmen. */
export type AttendanceActor = { userId: number; teacherId?: undefined } | { teacherId: number; userId?: undefined };

/**
 * Bir gün/ders için yoklamayı uygular. "Var" olanların kaydı silinir, işaretliler upsert edilir,
 * ilgili sınıflar için oturum (yoklama alındı bilgisi) yazılır.
 */
export async function applyAttendance(options: {
  branchId: number;
  academicYearId: number;
  date: Date;
  slot: number;
  entries: AttendanceEntry[];
  actor: AttendanceActor;
}) {
  const { branchId, academicYearId, date, slot, actor } = options;

  let lessonPeriodId: number | null = null;
  if (slot > 0) {
    const lesson = await prisma.lessonPeriod.findFirst({ where: { id: slot, branchId } });
    if (!lesson) return { error: "Ders bulunamadı" };
    lessonPeriodId = lesson.id;
  }

  // Yalnızca seçili kurum/yıla ait kayıtlar işlenir
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { id: { in: options.entries.map((entry) => entry.enrollmentId) }, branchId, academicYearId },
    select: { id: true, classGroupId: true },
  });
  const validIds = new Set(enrollments.map((enrollment) => enrollment.id));
  const entries = options.entries.filter((entry) => validIds.has(entry.enrollmentId));
  const classGroupIds = [
    ...new Set(enrollments.map((enrollment) => enrollment.classGroupId).filter((id): id is number => id !== null)),
  ];
  const presentIds = entries.filter((entry) => !entry.status).map((entry) => entry.enrollmentId);
  const markedEntries = entries.filter((entry) => entry.status);
  const actorFields = { createdById: actor.userId ?? null, teacherId: actor.teacherId ?? null };
  const sessionActor = { takenById: actor.userId ?? null, teacherId: actor.teacherId ?? null };

  await prisma.$transaction([
    prisma.attendanceRecord.deleteMany({ where: { date, slot, enrollmentId: { in: presentIds } } }),
    ...markedEntries.map((entry) =>
      prisma.attendanceRecord.upsert({
        where: { enrollmentId_date_slot: { enrollmentId: entry.enrollmentId, date, slot } },
        create: {
          date,
          slot,
          lessonPeriodId,
          enrollmentId: entry.enrollmentId,
          status: entry.status!,
          note: entry.note || null,
          ...actorFields,
        },
        update: { status: entry.status!, note: entry.note || null },
      }),
    ),
    ...classGroupIds.map((classGroupId) =>
      prisma.attendanceSession.upsert({
        where: { classGroupId_date_slot: { classGroupId, date, slot } },
        create: { classGroupId, date, slot, ...sessionActor },
        update: sessionActor,
      }),
    ),
  ]);

  // Günlük devamsızlık kayıtlarını türet
  await recomputeDailyAbsences(entries.map((entry) => entry.enrollmentId), [date]);

  return { ok: true as const, markedCount: markedEntries.length };
}
