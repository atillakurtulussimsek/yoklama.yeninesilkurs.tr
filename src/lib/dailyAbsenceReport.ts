import "server-only";
import { prisma } from "@/lib/db";
import { classLabel, compareClassGroups, fullName } from "@/lib/classGroups";
import { formatDateTime, isDateStr, toDbDate, todayStr } from "@/lib/dates";
import { CONTACT_LABELS, RELATION_LABELS } from "@/lib/labels";
import { sortGuardianLinks } from "@/lib/phone";
import type { ContactResult, DailyAbsenceKind, DaySession, GuardianRelation } from "@/generated/prisma/enums";

export type DailyFilter = { date: string; classGroupId: number; kind: DailyAbsenceKind | "" };

export function parseDailyFilter(params: Record<string, string | string[] | undefined>): DailyFilter {
  const kind = params.tur;
  return {
    date: isDateStr(params.tarih) ? params.tarih : todayStr(),
    classGroupId: Number(params.sinif) || 0,
    kind: kind === "FULL_DAY" || kind === "HALF_DAY" || kind === "LATE" || kind === "EXCUSED" ? kind : "",
  };
}

export function dailyFilterQuery(filter: DailyFilter) {
  return new URLSearchParams({
    tarih: filter.date,
    sinif: filter.classGroupId ? String(filter.classGroupId) : "",
    tur: filter.kind,
  }).toString();
}

export type DailyContact = {
  id: number;
  result: ContactResult;
  note: string | null;
  guardianName: string | null;
  userName: string;
  createdAt: string;
  userId: number;
};

export type DailyRow = {
  id: number;
  enrollmentId: number;
  studentNo: number;
  fullName: string;
  className: string;
  kind: DailyAbsenceKind;
  days: number;
  session: DaySession | null;
  lateCount: number;
  detail: string | null;
  /** Katılmadığı dersler (kısa): "5, 6. ders" / "Günlük" */
  missedLessons: string;
  note: string | null;
  manual: boolean;
  recordIds: number[];
  guardians: { id: number; relation: GuardianRelation; firstName: string; phone: string | null }[];
  contacts: DailyContact[];
};

export async function getDailyAbsences(branchId: number, academicYearId: number, filter: DailyFilter): Promise<DailyRow[]> {
  const date = toDbDate(filter.date);
  const rows = await prisma.dailyAbsence.findMany({
    where: {
      date,
      ...(filter.kind ? { kind: filter.kind } : {}),
      enrollment: { branchId, academicYearId, ...(filter.classGroupId ? { classGroupId: filter.classGroupId } : {}) },
    },
    include: {
      enrollment: {
        select: {
          id: true,
          studentNo: true,
          classGroup: { select: { gradeLevel: true, name: true } },
          student: {
            select: {
              firstName: true,
              lastName: true,
              guardians: { select: { contactOrder: true, relation: true, guardian: { select: { id: true, firstName: true, phone: true } } } },
            },
          },
          attendanceRecords: {
            where: { date },
            select: {
              id: true,
              slot: true,
              status: true,
              lessonPeriod: { select: { orderNo: true } },
              contactLogs: {
                include: { user: { select: { fullName: true } }, guardian: { select: { firstName: true, lastName: true } } },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      },
    },
  });

  return rows
    .map((row) => {
      const logs = row.enrollment.attendanceRecords.flatMap((record) => record.contactLogs);
      // Aynı bildirim birden çok ders kaydına yazılmış olabilir; tekilleştir
      const seen = new Set<string>();
      const contacts: DailyContact[] = [];
      for (const log of logs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
        const key = `${log.result}|${log.note ?? ""}|${log.guardianId ?? ""}|${Math.round(log.createdAt.getTime() / 2000)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        contacts.push({
          id: log.id,
          result: log.result,
          note: log.note,
          guardianName: log.guardian ? fullName(log.guardian) : null,
          userName: log.user.fullName,
          createdAt: log.createdAt.toISOString(),
          userId: log.userId,
        });
      }
      return {
        id: row.id,
        enrollmentId: row.enrollmentId,
        studentNo: row.enrollment.studentNo,
        fullName: fullName(row.enrollment.student),
        className: classLabel(row.enrollment.classGroup),
        classGroup: row.enrollment.classGroup,
        kind: row.kind,
        days: Number(row.days),
        session: row.session,
        lateCount: row.lateCount,
        detail: row.detail,
        missedLessons: summarizeMissedLessons(row.enrollment.attendanceRecords),
        note: row.note,
        manual: row.manual,
        recordIds: row.enrollment.attendanceRecords.map((record) => record.id),
        guardians: sortGuardianLinks(row.enrollment.student.guardians).map((link) => ({
          id: link.guardian.id,
          relation: link.relation,
          firstName: link.guardian.firstName,
          phone: link.guardian.phone,
        })),
        contacts,
      };
    })
    .sort((a, b) => compareClassGroups(a.classGroup, b.classGroup) || a.fullName.localeCompare(b.fullName, "tr-TR"))
    .map((row) => {
      const { classGroup, ...rest } = row;
      void classGroup;
      return rest;
    });
}

/** "5, 6. ders" · "1. ders geç" gibi kısa özet. */
function summarizeMissedLessons(records: { slot: number; status: string; lessonPeriod: { orderNo: number } | null }[]) {
  if (records.some((r) => r.slot === 0 && (r.status === "ABSENT" || r.status === "EXCUSED"))) return "Günlük";
  const absent = records
    .filter((r) => r.lessonPeriod && (r.status === "ABSENT" || r.status === "EXCUSED"))
    .map((r) => r.lessonPeriod!.orderNo)
    .sort((a, b) => a - b);
  const late = records
    .filter((r) => r.lessonPeriod && r.status === "LATE")
    .map((r) => r.lessonPeriod!.orderNo)
    .sort((a, b) => a - b);
  const early = records
    .filter((r) => r.lessonPeriod && r.status === "EARLY_LEAVE")
    .map((r) => r.lessonPeriod!.orderNo)
    .sort((a, b) => a - b);
  const parts: string[] = [];
  if (absent.length) parts.push(`${absent.join(", ")}. ders`);
  if (late.length) parts.push(`${late.join(", ")}. ders geç`);
  if (early.length) parts.push(`${early.join(", ")}. ders erken çıkış`);
  return parts.join(" · ");
}

/** Rapor/PDF için veli görüşmesi özeti. */
export function formatContacts(contacts: DailyContact[]) {
  return contacts
    .map((contact) => {
      const who = contact.guardianName ? ` – ${contact.guardianName}` : "";
      const note = contact.note ? `: ${contact.note}` : "";
      return `${CONTACT_LABELS[contact.result]}${who}${note} (${formatDateTime(new Date(contact.createdAt))})`;
    })
    .join("\n");
}

export function formatGuardianShort(guardian: { relation: GuardianRelation; firstName: string }) {
  return `${RELATION_LABELS[guardian.relation]} (${guardian.firstName})`;
}
