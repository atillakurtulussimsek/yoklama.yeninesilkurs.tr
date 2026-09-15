"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getContext } from "@/lib/context";
import { recomputeDailyAbsences } from "@/lib/dailyAbsence";
import { isDateStr, toDbDate } from "@/lib/dates";

async function scope() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { branch, academicYear } = await getContext();
  return branch && academicYear ? { user, branchId: branch.id, academicYearId: academicYear.id } : null;
}

const updateSchema = z.object({
  id: z.number().int().positive(),
  kind: z.enum(["FULL_DAY", "HALF_DAY", "LATE", "EXCUSED"]).optional(),
  note: z.string().trim().max(500).optional(),
});

/** Açıklama ve/veya türü günceller. Tür değiştirilirse satır elle düzenlenmiş sayılır ve otomatik hesap onu ezmez. */
export async function updateDailyAbsence(input: z.infer<typeof updateSchema>) {
  const current = await scope();
  if (!current) return { error: "Oturum sona erdi" };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const row = await prisma.dailyAbsence.findFirst({
    where: { id: parsed.data.id, enrollment: { branchId: current.branchId, academicYearId: current.academicYearId } },
  });
  if (!row) return { error: "Kayıt bulunamadı" };

  const kindChanged = parsed.data.kind !== undefined && parsed.data.kind !== row.kind;
  await prisma.dailyAbsence.update({
    where: { id: row.id },
    data: {
      ...(parsed.data.note !== undefined ? { note: parsed.data.note || null } : {}),
      ...(kindChanged
        ? {
            kind: parsed.data.kind,
            days: parsed.data.kind === "LATE" ? 0 : parsed.data.kind === "HALF_DAY" ? 0.5 : 1,
            manual: true,
          }
        : {}),
      updatedById: current.user.id,
    },
  });
  revalidatePath("/gunluk-devamsizlik");
  return { ok: true };
}

/** Elle yapılan tür değişikliğini geri alır, otomatik hesaba döner. */
export async function resetDailyAbsence(id: number) {
  const current = await scope();
  if (!current) return { error: "Oturum sona erdi" };
  const row = await prisma.dailyAbsence.findFirst({
    where: { id, enrollment: { branchId: current.branchId, academicYearId: current.academicYearId } },
  });
  if (!row) return { error: "Kayıt bulunamadı" };
  await prisma.dailyAbsence.update({ where: { id }, data: { manual: false } });
  await recomputeDailyAbsences([row.enrollmentId], [row.date]);
  revalidatePath("/gunluk-devamsizlik");
  return { ok: true };
}

/** Bir günün günlük devamsızlıklarını ders kayıtlarından yeniden türetir (yönetici). */
export async function recomputeDay(day: string) {
  const current = await scope();
  if (current?.user.role !== "ADMIN") return { error: "Yetkiniz yok" };
  if (!isDateStr(day)) return { error: "Geçersiz tarih" };
  const date = toDbDate(day);
  const touched = await prisma.attendanceRecord.findMany({
    where: { date, enrollment: { branchId: current.branchId, academicYearId: current.academicYearId } },
    select: { enrollmentId: true },
    distinct: ["enrollmentId"],
  });
  const ids = touched.map((item) => item.enrollmentId);
  // Kaydı silinmiş öğrencilerin otomatik satırları da temizlensin
  const stale = await prisma.dailyAbsence.findMany({
    where: { date, manual: false, enrollmentId: { notIn: ids }, enrollment: { branchId: current.branchId, academicYearId: current.academicYearId } },
    select: { enrollmentId: true },
  });
  await recomputeDailyAbsences([...ids, ...stale.map((row) => row.enrollmentId)], [date]);
  revalidatePath("/gunluk-devamsizlik");
  return { ok: true, count: ids.length };
}
