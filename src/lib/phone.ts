/** Telefonu "05XXXXXXXXX" biçimine getirir; tanınmazsa rakamları döndürür. */
export function normalizePhone(value: unknown) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 12 && digits.startsWith("90")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("5")) digits = `0${digits}`;
  return digits.slice(0, 20);
}

export function formatPhone(value: string | null | undefined) {
  if (!value) return "";
  const match = value.match(/^0(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return match ? `0${match[1]} ${match[2]} ${match[3]} ${match[4]}` : value;
}

/** Veli bağlantılarını ulaşım sırasına göre dizer (sırası olmayanlar sonda). */
export function sortGuardianLinks<T extends { contactOrder: number | null }>(links: T[]) {
  return [...links].sort((a, b) => (a.contactOrder ?? 99) - (b.contactOrder ?? 99));
}

export function primaryPhone(links: { contactOrder: number | null; guardian: { phone: string | null } }[]) {
  return sortGuardianLinks(links).find((link) => link.guardian.phone)?.guardian.phone ?? null;
}
