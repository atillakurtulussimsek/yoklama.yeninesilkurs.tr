import type { DailyAbsenceKind } from "@/generated/prisma/enums";

export const DAILY_KIND_LABELS: Record<DailyAbsenceKind, string> = {
  FULL_DAY: "Tam gün",
  HALF_DAY: "Yarım gün",
  LATE: "Geç",
  EXCUSED: "Mazeretli",
};

export const DAILY_KIND_COLORS: Record<DailyAbsenceKind, string> = {
  FULL_DAY: "bg-red-100 text-red-800 ring-red-200",
  HALF_DAY: "bg-orange-100 text-orange-800 ring-orange-200",
  LATE: "bg-amber-100 text-amber-800 ring-amber-200",
  EXCUSED: "bg-violet-100 text-violet-800 ring-violet-200",
};

export const DAILY_KINDS = Object.keys(DAILY_KIND_LABELS) as DailyAbsenceKind[];
