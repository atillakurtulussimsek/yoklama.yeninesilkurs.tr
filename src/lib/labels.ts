import type { AttendanceStatus, ContactResult, GuardianRelation } from "@/generated/prisma/enums";

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  ABSENT: "Gelmedi",
  LATE: "Geç",
  EARLY_LEAVE: "Erken çıkış",
  EXCUSED: "Mazeretli",
};

export const STATUS_COLORS: Record<AttendanceStatus, string> = {
  ABSENT: "bg-red-100 text-red-800 ring-red-200",
  LATE: "bg-amber-100 text-amber-800 ring-amber-200",
  EARLY_LEAVE: "bg-sky-100 text-sky-800 ring-sky-200",
  EXCUSED: "bg-violet-100 text-violet-800 ring-violet-200",
};

export const STATUSES = Object.keys(STATUS_LABELS) as AttendanceStatus[];

export const CONTACT_LABELS: Record<ContactResult, string> = {
  REACHED: "Arandı, ulaşıldı",
  NO_ANSWER: "Cevapsız",
  SMS_SENT: "Mesaj atıldı",
  PARENT_INFORMED: "Veli önceden bildirdi",
};

export const CONTACT_COLORS: Record<ContactResult, string> = {
  REACHED: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  NO_ANSWER: "bg-orange-100 text-orange-800 ring-orange-200",
  SMS_SENT: "bg-blue-100 text-blue-800 ring-blue-200",
  PARENT_INFORMED: "bg-teal-100 text-teal-800 ring-teal-200",
};

export const CONTACT_RESULTS = Object.keys(CONTACT_LABELS) as ContactResult[];

export const RELATION_LABELS: Record<GuardianRelation, string> = {
  MOTHER: "Anne",
  FATHER: "Baba",
  OTHER: "Diğer",
};
