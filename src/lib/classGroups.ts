export type ClassGroupLike = { gradeLevel: string; name: string };

export function classLabel(group: ClassGroupLike | null | undefined) {
  return group ? `${group.gradeLevel}/${group.name}` : "Şubesiz";
}

export function compareClassGroups(a: ClassGroupLike | null, b: ClassGroupLike | null) {
  return classLabel(a).localeCompare(classLabel(b), "tr-TR", { numeric: true });
}

/** "Mezun/F5" -> { gradeLevel: "Mezun", name: "F5" }; "12 TM2" -> { gradeLevel: "12", name: "TM2" } */
export function parseClassText(value: string, gradeLevelFallback = "") {
  const text = value.trim();
  if (!text) return null;
  const slash = text.match(/^(.+?)\s*\/\s*(.+)$/);
  if (slash) return { gradeLevel: slash[1].trim(), name: slash[2].replace(/\s+/g, "") };
  const numeric = text.match(/^(\d{1,2})\s*[-.\s]?\s*(.+)$/);
  if (numeric) return { gradeLevel: numeric[1], name: numeric[2].replace(/[\s\-.]+/g, "") };
  return gradeLevelFallback ? { gradeLevel: gradeLevelFallback, name: text.replace(/\s+/g, "") } : null;
}

export function fullName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`;
}
