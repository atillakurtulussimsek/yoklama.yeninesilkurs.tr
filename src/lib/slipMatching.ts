import type { AttendanceStatus } from "@/generated/prisma/enums";
import type { ParsedAbsence } from "@/lib/ai";
import { classLabel } from "@/lib/classGroups";

export type Candidate = {
  enrollmentId: number;
  studentNo: number;
  fullName: string;
  classGroupId: number | null;
  className: string;
};

export type MatchedAbsence = {
  raw: string;
  status: AttendanceStatus;
  note: string | null;
  enrollmentId: number | null;
  fullName: string | null;
  studentNo: number | null;
  score: number;
};

export type MatchedLesson = {
  lessonNo: number;
  subject: string | null;
  slot: number;
  lessonName: string;
  full: boolean;
  absences: MatchedAbsence[];
};

export type MatchResult = {
  classGroupId: number | null;
  className: string | null;
  date: string;
  lessons: MatchedLesson[];
};

const normalize = (value: string) =>
  value
    .toLocaleUpperCase("tr-TR")
    .replace(/[İ]/g, "I")
    .replace(/[^A-ZÇĞÖŞÜ0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function bigrams(value: string) {
  const text = value.replace(/ /g, "");
  const set = new Map<string, number>();
  for (let i = 0; i < text.length - 1; i++) {
    const gram = text.slice(i, i + 2);
    set.set(gram, (set.get(gram) ?? 0) + 1);
  }
  return set;
}

/** Sørensen–Dice benzerliği (0–1). */
export function similarity(a: string, b: string) {
  const x = bigrams(normalize(a));
  const y = bigrams(normalize(b));
  if (x.size === 0 || y.size === 0) return 0;
  let overlap = 0;
  for (const [gram, count] of x) overlap += Math.min(count, y.get(gram) ?? 0);
  const total = [...x.values()].reduce((s, n) => s + n, 0) + [...y.values()].reduce((s, n) => s + n, 0);
  return (2 * overlap) / total;
}

export function matchClassGroup(className: string | null, groups: { id: number; gradeLevel: string; name: string }[]) {
  if (!className) return null;
  const target = normalize(className);
  let best: { id: number; score: number } | null = null;
  for (const group of groups) {
    const label = classLabel(group);
    const candidates = [label, group.name, `${group.gradeLevel} ${group.name}`];
    const score = Math.max(...candidates.map((c) => (normalize(c) === target ? 1 : similarity(c, className))));
    if (!best || score > best.score) best = { id: group.id, score };
  }
  return best && best.score >= 0.6 ? best.id : null;
}

/**
 * Bir dersin devamsızlarını kayıtlarla eşleştirir. Önce numara, sonra sınıf içinde isim, sonra tüm kurumda isim.
 */
export function matchAbsences(absences: ParsedAbsence[], candidates: Candidate[], classGroupId: number | null): MatchedAbsence[] {
  const inClass = classGroupId ? candidates.filter((c) => c.classGroupId === classGroupId) : [];
  const byNo = new Map(candidates.map((c) => [c.studentNo, c]));
  const used = new Set<number>();

  return absences.map((absence) => {
    // İsim alanına yalnızca numara yazılmış olabilir
    const nameAsNo = absence.name && /^\d{1,6}$/.test(absence.name.trim()) ? Number(absence.name) : null;
    const studentNo = absence.studentNo ?? nameAsNo;
    const name = nameAsNo ? null : absence.name;
    const raw = name || (studentNo ? `No ${studentNo}` : "?");
    const unmatched = (score: number): MatchedAbsence => ({
      raw,
      status: absence.status,
      note: absence.note,
      enrollmentId: null,
      fullName: null,
      studentNo: null,
      score,
    });
    const matched = (candidate: Candidate, score: number): MatchedAbsence => {
      used.add(candidate.enrollmentId);
      return {
        raw,
        status: absence.status,
        note: absence.note,
        enrollmentId: candidate.enrollmentId,
        fullName: candidate.fullName,
        studentNo: candidate.studentNo,
        score: Math.round(score * 100) / 100,
      };
    };

    if (studentNo) {
      const candidate = byNo.get(studentNo);
      if (candidate && !used.has(candidate.enrollmentId)) {
        // Numara başka sınıftan çıkarsa yine eşle ama puanı düşür (uyarı gösterilir)
        return matched(candidate, classGroupId && candidate.classGroupId !== classGroupId ? 0.7 : 1);
      }
      if (!name) return unmatched(0);
    }

    let best: { candidate: Candidate; score: number } | null = null;
    for (const pool of inClass.length ? [inClass, candidates] : [candidates]) {
      for (const candidate of pool) {
        if (used.has(candidate.enrollmentId)) continue;
        let score = similarity(name!, candidate.fullName);
        const parts = normalize(name!).split(" ");
        const candParts = normalize(candidate.fullName).split(" ");
        if (parts.length === 1 && candParts.includes(parts[0])) score = Math.max(score, 0.7);
        if (!best || score > best.score) best = { candidate, score };
      }
      if (best && best.score >= 0.55) break;
    }
    return best && best.score >= 0.55 ? matched(best.candidate, best.score) : unmatched(best?.score ?? 0);
  });
}
