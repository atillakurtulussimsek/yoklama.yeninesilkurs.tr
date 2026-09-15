import type { AttendanceStatus, DaySession } from "@/generated/prisma/enums";

/**
 * Gün bazlı devamsızlık kuralı:
 * - Günlük yoklamada (slot 0) "Gelmedi"/"Mazeretli" → 1 gün.
 * - Ders ders yoklamada: bir oturumda (sabah/öğleden sonra) işlenen derslerin 2 veya daha fazlasında yoksa → 0,5 gün;
 *   yalnızca 1 derste yoksa → "geç" sayılır (gün sayılmaz); günün işlenen tüm derslerinde yoksa → 1 gün.
 * - "Geç" işaretli derste öğrenci var sayılır; "Mazeretli" yok sayılır (raporlarda ayrıca gösterilir).
 */

export const SESSION_LABELS: Record<DaySession, string> = { MORNING: "Sabah", AFTERNOON: "Öğleden sonra" };

export type DayRecord = { slot: number; status: AttendanceStatus };

export type DayResult = {
  /** 0, 0.5 veya 1 */
  days: number;
  /** Tek ders kaçırma (oturumda 1 ders) + geç işaretli dersler */
  lateCount: number;
  /** Mazeretli işaretli ders/gün sayısı */
  excusedCount: number;
  /** Gelmedi + mazeretli ders sayısı (günlük yoklamada 1) */
  absentLessons: number;
};

const ABSENT_STATUSES = new Set<AttendanceStatus>(["ABSENT", "EXCUSED"]);

/**
 * @param records Öğrencinin o günkü kayıtları (kayıt yoksa var demektir)
 * @param takenSlots O gün öğrencinin sınıfı için yoklama alınan slotlar (0 = günlük)
 * @param sessionOf Ders id → oturum
 */
export function summarizeDay(records: DayRecord[], takenSlots: Iterable<number>, sessionOf: Map<number, DaySession>): DayResult {
  const result: DayResult = { days: 0, lateCount: 0, excusedCount: 0, absentLessons: 0 };
  const byStatus = new Map(records.map((record) => [record.slot, record.status]));

  for (const record of records) {
    if (record.status === "LATE") result.lateCount++;
    if (record.status === "EXCUSED") result.excusedCount++;
  }

  // Günlük yoklama tek başına belirleyicidir
  const daily = byStatus.get(0);
  if (daily && ABSENT_STATUSES.has(daily)) {
    result.days = 1;
    result.absentLessons = 1;
    return result;
  }

  const slots = new Set<number>();
  for (const slot of takenSlots) if (slot !== 0) slots.add(slot);
  // Yoklama oturumu kaydı yoksa kayıtlardaki slotlar üzerinden hesapla
  for (const record of records) if (record.slot !== 0) slots.add(record.slot);
  if (slots.size === 0) return result;

  const perSession: Record<DaySession, { taken: number; absent: number }> = {
    MORNING: { taken: 0, absent: 0 },
    AFTERNOON: { taken: 0, absent: 0 },
  };
  for (const slot of slots) {
    const session = sessionOf.get(slot) ?? "MORNING";
    perSession[session].taken++;
    const status = byStatus.get(slot);
    if (status && ABSENT_STATUSES.has(status)) {
      perSession[session].absent++;
      result.absentLessons++;
    }
  }

  const totalTaken = perSession.MORNING.taken + perSession.AFTERNOON.taken;
  if (result.absentLessons > 0 && result.absentLessons === totalTaken) {
    result.days = 1;
    return result;
  }
  for (const session of ["MORNING", "AFTERNOON"] as const) {
    const { absent } = perSession[session];
    if (absent >= 2) result.days += 0.5;
    else if (absent === 1) result.lateCount++;
  }
  return result;
}

export function formatDays(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
}
