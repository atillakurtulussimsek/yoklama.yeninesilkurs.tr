import "server-only";
import { prisma } from "@/lib/db";
import { analyzeSlipImage, type ParsedSlip } from "@/lib/ai";
import { applyAttendance, type AttendanceActor, type AttendanceEntry } from "@/lib/attendance";
import { classLabel, compareClassGroups, fullName } from "@/lib/classGroups";
import { fromDbDate, isDateStr, parseTrDate, toDbDate, todayStr } from "@/lib/dates";
import { matchAbsences, matchClassGroup, type MatchedLesson, type MatchResult } from "@/lib/slipMatching";

/**
 * Görseli çözümler ve kayıtlarla eşleştirir; sonucu fiş kaydına yazar.
 * Başarıda fiş PENDING (onay bekliyor), hatada FAILED olur.
 */
export async function analyzeSlip(
  slipId: number,
  image: { base64: string; mime: string },
  options: { dateOverride?: string | null } = {},
): Promise<{ matched: MatchResult; parsed: ParsedSlip; ms: number } | { error: string }> {
  const slip = await prisma.attendanceSlip.findUnique({ where: { id: slipId } });
  if (!slip) return { error: "Fiş bulunamadı" };
  const { branchId, academicYearId } = slip;

  const fail = async (error: string) => {
    console.error(`Fiş #${slipId} başarısız:`, error);
    await prisma.attendanceSlip.update({
      where: { id: slipId },
      data: { status: "FAILED", errorMessage: error.slice(0, 500), totalMs: Date.now() - slip.createdAt.getTime() },
    });
    return { error };
  };

  const [groups, enrollments] = await Promise.all([
    prisma.classGroup.findMany({ where: { branchId, academicYearId, isActive: true } }),
    prisma.studentEnrollment.findMany({
      where: { branchId, academicYearId, status: "ACTIVE" },
      select: {
        id: true,
        studentNo: true,
        classGroupId: true,
        classGroup: { select: { gradeLevel: true, name: true } },
        student: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const analysis = await analyzeSlipImage({
    branchId,
    imageBase64: image.base64,
    mime: image.mime,
    classLabels: groups.sort(compareClassGroups).map(classLabel),
  });
  if ("error" in analysis) return fail(analysis.error);
  const parsed = analysis.parsed;

  const classGroupId = matchClassGroup(parsed.className, groups);
  const date = resolveDate(options.dateOverride ?? parsed.date);
  const group = groups.find((item) => item.id === classGroupId);
  const candidates = enrollments.map((enrollment) => ({
    enrollmentId: enrollment.id,
    studentNo: enrollment.studentNo,
    fullName: fullName(enrollment.student),
    classGroupId: enrollment.classGroupId,
    className: classLabel(enrollment.classGroup),
  }));

  const lessonNos = [...new Set(parsed.lessons.map((lesson) => lesson.lessonNo))].sort((a, b) => a - b);
  const periods = await ensureLessonPeriods(branchId, lessonNos);

  const lessons: MatchedLesson[] = parsed.lessons
    .filter((lesson, index, all) => all.findIndex((item) => item.lessonNo === lesson.lessonNo) === index)
    .sort((a, b) => a.lessonNo - b.lessonNo)
    .map((lesson) => {
      const period = periods.get(lesson.lessonNo)!;
      return {
        lessonNo: lesson.lessonNo,
        subject: lesson.subject,
        slot: period.id,
        lessonName: period.name,
        full: lesson.full || lesson.absences.length === 0,
        absences: matchAbsences(lesson.absences, candidates, classGroupId),
      };
    });

  const matched: MatchResult = { classGroupId, className: group ? classLabel(group) : null, date, lessons };
  await prisma.attendanceSlip.update({
    where: { id: slipId },
    data: { status: "PENDING", parsed, matched, analysisMs: analysis.ms, totalMs: Date.now() - slip.createdAt.getTime(), errorMessage: null },
  });
  return { matched, parsed, ms: analysis.ms };
}

/** Fişteki ders numaraları için tanımlı ders yoksa "N. Ders" olarak oluşturulur. */
async function ensureLessonPeriods(branchId: number, lessonNos: number[]) {
  const existing = await prisma.lessonPeriod.findMany({ where: { branchId, orderNo: { in: lessonNos } } });
  const map = new Map(existing.filter((p) => p.isActive).map((p) => [p.orderNo, p]));
  for (const period of existing) if (!map.has(period.orderNo)) map.set(period.orderNo, period);
  for (const lessonNo of lessonNos) {
    if (map.has(lessonNo)) continue;
    const created = await prisma.lessonPeriod.create({
      data: { branchId, orderNo: lessonNo, name: `${lessonNo}. Ders`, session: lessonNo >= 5 ? "AFTERNOON" : "MORNING" },
    });
    map.set(lessonNo, created);
  }
  return map;
}

function resolveDate(value: string | null) {
  if (!value) return todayStr();
  if (isDateStr(value)) return value;
  const parsed = parseTrDate(value);
  return parsed ? fromDbDate(parsed) : todayStr();
}

/**
 * Onaylanan fişi yoklamaya işler. Sınıf/tarih düzeltmesi verilebilir (web onayı).
 */
export async function applySlip(
  slipId: number,
  actor: AttendanceActor,
  overrides: { classGroupId?: number; date?: string; reviewedById?: number } = {},
): Promise<{ ok: true; markedTotal: number; matched: MatchResult } | { error: string }> {
  const slip = await prisma.attendanceSlip.findUnique({ where: { id: slipId } });
  if (!slip) return { error: "Fiş bulunamadı" };
  if (slip.status !== "PENDING") return { error: "Bu fiş zaten işlendi" };

  const stored = slip.matched as MatchResult | null;
  if (!stored) return { error: "Çözümleme bulunamadı" };
  const matched: MatchResult = { ...stored };

  if (overrides.classGroupId && overrides.classGroupId !== matched.classGroupId) {
    const group = await prisma.classGroup.findFirst({
      where: { id: overrides.classGroupId, branchId: slip.branchId, academicYearId: slip.academicYearId },
    });
    if (!group) return { error: "Sınıf bulunamadı" };
    matched.classGroupId = group.id;
    matched.className = classLabel(group);
  }
  if (overrides.date && isDateStr(overrides.date)) matched.date = overrides.date;

  if (!matched.classGroupId || matched.lessons.length === 0) return { error: "Sınıf seçilmeden veya ders olmadan kayıt yapılamaz" };

  const classmates = await prisma.studentEnrollment.findMany({
    where: { classGroupId: matched.classGroupId, status: "ACTIVE" },
    select: { id: true },
  });
  let markedTotal = 0;
  for (const lesson of matched.lessons) {
    const marked: AttendanceEntry[] = lesson.absences
      .filter((absence) => absence.enrollmentId)
      .map((absence) => ({ enrollmentId: absence.enrollmentId!, status: absence.status, note: absence.note ?? undefined }));
    const markedIds = new Set(marked.map((entry) => entry.enrollmentId));
    // Sınıfın diğer öğrencileri o derste var sayılır
    const present: AttendanceEntry[] = classmates.filter((c) => !markedIds.has(c.id)).map((c) => ({ enrollmentId: c.id, status: null }));

    const result = await applyAttendance({
      branchId: slip.branchId,
      academicYearId: slip.academicYearId,
      date: toDbDate(matched.date),
      slot: lesson.slot,
      entries: [...marked, ...present],
      actor,
    });
    if ("error" in result) {
      const error = `${lesson.lessonNo}. ders kaydedilemedi: ${result.error ?? "Bilinmeyen hata"}`;
      await prisma.attendanceSlip.update({ where: { id: slipId }, data: { status: "FAILED", errorMessage: error } });
      return { error };
    }
    markedTotal += result.markedCount;
  }

  await prisma.attendanceSlip.update({
    where: { id: slipId },
    data: { status: "APPLIED", appliedAt: new Date(), matched, reviewedById: overrides.reviewedById ?? null },
  });
  return { ok: true, markedTotal, matched };
}
