import "server-only";
import { prisma } from "@/lib/db";
import { classLabel, compareClassGroups, fullName } from "@/lib/classGroups";
import { addDays, fromDbDate, isDateStr, toDbDate, todayStr } from "@/lib/dates";
import { CONTACT_LABELS, STATUSES } from "@/lib/labels";
import { summarizeDay, type DayRecord } from "@/lib/dayAbsence";
import type { AttendanceStatus } from "@/generated/prisma/enums";

export type ReportFilter = { from: string; to: string; classGroupId: number; termId: number };

export type TermOption = { id: number; name: string; startsOn: string; endsOn: string | null };

type Params = Record<string, string | string[] | undefined>;

const MAX_RANGE_DAYS = 400;

/** Dönem seçiliyse tarih aralığı dönemden gelir (bitişi olmayan dönemde bugüne kadar). */
export function parseReportFilter(params: Params, terms: TermOption[] = []): ReportFilter {
  const today = todayStr();
  const term = terms.find((item) => item.id === Number(params.donem));
  let to: string;
  let from: string;
  if (term) {
    to = term.endsOn && term.endsOn < today ? term.endsOn : today;
    from = term.startsOn;
  } else {
    to = isDateStr(params.bitis) ? params.bitis : today;
    from = isDateStr(params.baslangic) ? params.baslangic : addDays(to, -29);
  }
  if (from > to) from = to;
  if (from < addDays(to, -MAX_RANGE_DAYS)) from = addDays(to, -MAX_RANGE_DAYS);
  return { from, to, classGroupId: Number(params.sinif) || 0, termId: term?.id ?? 0 };
}

export function filterQuery(filter: ReportFilter) {
  return new URLSearchParams({
    baslangic: filter.from,
    bitis: filter.to,
    sinif: filter.classGroupId ? String(filter.classGroupId) : "",
    donem: filter.termId ? String(filter.termId) : "",
  }).toString();
}

export async function getTermOptions(academicYearId: number): Promise<TermOption[]> {
  const terms = await prisma.academicTerm.findMany({ where: { academicYearId }, orderBy: { startsOn: "asc" } });
  return terms.map((term) => ({
    id: term.id,
    name: term.name,
    startsOn: fromDbDate(term.startsOn),
    endsOn: term.endsOn ? fromDbDate(term.endsOn) : null,
  }));
}

/**
 * Sınıf seçenekleri. Varsayılan olarak yalnızca aktif öğrencisi olan şubeler döner;
 * geçmiş kayıtlar için (raporlar) includeEmpty ile boş şubeler de alınabilir.
 */
export async function getClassGroupOptions(branchId: number, academicYearId: number, options: { includeEmpty?: boolean } = {}) {
  const groups = await prisma.classGroup.findMany({
    where: {
      branchId,
      academicYearId,
      isActive: true,
      ...(options.includeEmpty ? {} : { enrollments: { some: { status: "ACTIVE" } } }),
    },
    select: { id: true, gradeLevel: true, name: true, field: true },
  });
  return groups.sort(compareClassGroups).map((group) => ({ ...group, label: classLabel(group) }));
}

const emptyCounts = () => Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<AttendanceStatus, number>;

export async function getReport(branchId: number, academicYearId: number, filter: ReportFilter) {
  const range = { gte: toDbDate(filter.from), lte: toDbDate(filter.to) };
  const classFilter = filter.classGroupId ? { classGroupId: filter.classGroupId } : {};
  const enrollmentWhere = { branchId, academicYearId, ...classFilter };

  const [records, activeEnrollments, groups, sessions, lessonPeriods] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { date: range, enrollment: enrollmentWhere },
      include: {
        enrollment: {
          select: {
            id: true,
            studentNo: true,
            status: true,
            classGroupId: true,
            classGroup: { select: { gradeLevel: true, name: true } },
            student: { select: { firstName: true, lastName: true } },
          },
        },
        lessonPeriod: { select: { name: true } },
        contactLogs: { select: { result: true, note: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ date: "asc" }, { slot: "asc" }],
    }),
    prisma.studentEnrollment.findMany({ where: { ...enrollmentWhere, status: "ACTIVE" }, select: { classGroupId: true } }),
    prisma.classGroup.findMany({
      where: { branchId, academicYearId, ...(filter.classGroupId ? { id: filter.classGroupId } : {}) },
      select: { id: true, gradeLevel: true, name: true },
    }),
    prisma.attendanceSession.findMany({
      where: { date: range, classGroup: { branchId, academicYearId }, ...classFilter },
      select: { date: true, slot: true, classGroupId: true },
    }),
    prisma.lessonPeriod.findMany({ where: { branchId }, select: { id: true, session: true } }),
  ]);
  const sessionOf = new Map(lessonPeriods.map((lesson) => [lesson.id, lesson.session]));
  const takenSlots = new Map<string, Set<number>>();
  for (const session of sessions) {
    const key = `${session.classGroupId}|${fromDbDate(session.date)}`;
    const set = takenSlots.get(key) ?? new Set<number>();
    set.add(session.slot);
    takenSlots.set(key, set);
  }

  type StudentRow = {
    id: number;
    studentNo: number;
    fullName: string;
    className: string;
    active: boolean;
    /** Gün → o günkü kayıtlar; gün değeri summarizeDay ile hesaplanır */
    byDay: Map<string, DayRecord[]>;
    absentDays: number;
    halfDays: number;
    fullDays: number;
    lateEquivalent: number;
    counts: Record<AttendanceStatus, number>;
    uncontacted: number;
  };
  type ClassRow = {
    classGroupId: number;
    className: string;
    group: { gradeLevel: string; name: string } | null;
    studentCount: number;
    takenDays: Set<string>;
    absentStudentDays: number;
    counts: Record<AttendanceStatus, number>;
  };
  type DayRow = { date: string; students: Set<number>; fullDays: number; halfDays: number; late: number; excused: number; days: number };

  const students = new Map<number, StudentRow>();
  const classes = new Map<number, ClassRow>();
  const days = new Map<string, DayRow>();
  const totals = { counts: emptyCounts(), uncontacted: 0, absentStudentDays: 0, halfDays: 0, fullDays: 0, students: new Set<number>() };

  const getClass = (classGroupId: number | null, group: { gradeLevel: string; name: string } | null = null) => {
    const key = classGroupId ?? 0;
    let row = classes.get(key);
    if (!row) {
      row = {
        classGroupId: key,
        className: classLabel(group),
        group,
        studentCount: 0,
        takenDays: new Set(),
        absentStudentDays: 0,
        counts: emptyCounts(),
      };
      classes.set(key, row);
    }
    return row;
  };

  for (const group of groups) getClass(group.id, group);
  for (const enrollment of activeEnrollments) getClass(enrollment.classGroupId).studentCount++;
  for (const session of sessions) getClass(session.classGroupId).takenDays.add(fromDbDate(session.date));

  const enrollmentClass = new Map<number, number | null>();
  for (const record of records) {
    const { enrollment } = record;
    const date = fromDbDate(record.date);
    let student = students.get(enrollment.id);
    if (!student) {
      student = {
        id: enrollment.id,
        studentNo: enrollment.studentNo,
        fullName: fullName(enrollment.student),
        className: classLabel(enrollment.classGroup),
        active: enrollment.status === "ACTIVE",
        byDay: new Map(),
        absentDays: 0,
        halfDays: 0,
        fullDays: 0,
        lateEquivalent: 0,
        counts: emptyCounts(),
        uncontacted: 0,
      };
      students.set(enrollment.id, student);
      enrollmentClass.set(enrollment.id, enrollment.classGroupId);
    }

    student.counts[record.status]++;
    const dayRecords = student.byDay.get(date) ?? [];
    dayRecords.push({ slot: record.slot, status: record.status });
    student.byDay.set(date, dayRecords);
    if (record.contactLogs.length === 0) {
      student.uncontacted++;
      totals.uncontacted++;
    }

    getClass(enrollment.classGroupId, enrollment.classGroup).counts[record.status]++;


    totals.counts[record.status]++;
    totals.students.add(enrollment.id);
  }

  for (const student of students.values()) {
    const classGroupId = enrollmentClass.get(student.id) ?? null;
    for (const [day, dayRecords] of student.byDay) {
      const summary = summarizeDay(dayRecords, takenSlots.get(`${classGroupId}|${day}`) ?? [], sessionOf);
      student.absentDays += summary.days;
      student.lateEquivalent += summary.lateCount;
      if (summary.days === 1) student.fullDays++;
      else if (summary.days === 0.5) student.halfDays++;

      // Gün bazında: öğrenci ve gün türleri (ders kaydı sayısı değil)
      const dayRow = days.get(day) ?? { date: day, students: new Set<number>(), fullDays: 0, halfDays: 0, late: 0, excused: 0, days: 0 };
      if (summary.days > 0 || summary.lateCount > 0) dayRow.students.add(student.id);
      const allExcused = summary.days > 0 && dayRecords.filter((r) => r.status === "ABSENT" || r.status === "EXCUSED").every((r) => r.status === "EXCUSED");
      if (allExcused) dayRow.excused++;
      else if (summary.days === 1) dayRow.fullDays++;
      else if (summary.days === 0.5) dayRow.halfDays++;
      if (summary.days === 0 && summary.lateCount > 0) dayRow.late++;
      dayRow.days += summary.days;
      days.set(day, dayRow);
    }
    getClass(classGroupId).absentStudentDays += student.absentDays;
    totals.absentStudentDays += student.absentDays;
    totals.halfDays += student.halfDays;
    totals.fullDays += student.fullDays;
  }

  return {
    filter,
    totals: { ...totals, studentCount: totals.students.size },
    studentRows: [...students.values()].sort(
      (a, b) =>
        b.absentDays - a.absentDays ||
        b.lateEquivalent - a.lateEquivalent ||
        a.fullName.localeCompare(b.fullName, "tr-TR"),
    ),
    classRows: [...classes.values()].sort((a, b) => compareClassGroups(a.group, b.group)),
    dayRows: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)),
    records: records.map((record) => ({
      date: fromDbDate(record.date),
      studentNo: record.enrollment.studentNo,
      fullName: fullName(record.enrollment.student),
      className: classLabel(record.enrollment.classGroup),
      lesson: record.lessonPeriod?.name ?? "Günlük",
      status: record.status,
      note: record.note ?? "",
      contact: record.contactLogs
        .map((log) => (log.note ? `${CONTACT_LABELS[log.result]} (${log.note})` : CONTACT_LABELS[log.result]))
        .join("; "),
    })),
  };
}
