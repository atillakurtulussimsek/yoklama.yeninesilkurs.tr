const TIME_ZONE = "Europe/Istanbul";

/** İstanbul saatine göre bugünün tarihi (YYYY-MM-DD). */
export function todayStr() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

export function isDateStr(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** "YYYY-MM-DD" -> @db.Date alanı için UTC gece yarısı. */
export function toDbDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function fromDbDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number) {
  const date = toDbDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return fromDbDate(date);
}

/** Excel tarih hücresi veya "11.09.2026" metnini tarihe çevirir. */
export function parseTrDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : toDbDate(fromDbDate(value));
  const match = String(value ?? "").trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (!match) return null;
  const text = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  const date = toDbDate(text);
  return Number.isNaN(date.getTime()) || fromDbDate(date) !== text ? null : date;
}

export function formatDate(value: string | Date) {
  const str = typeof value === "string" ? value : fromDbDate(value);
  const [y, m, d] = str.split("-");
  return `${d}.${m}.${y}`;
}

export function formatDateLong(value: string | Date) {
  const str = typeof value === "string" ? value : fromDbDate(value);
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  }).format(toDbDate(str));
}

export function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
