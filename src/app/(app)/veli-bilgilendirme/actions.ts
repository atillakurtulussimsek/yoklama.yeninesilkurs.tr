"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getContext } from "@/lib/context";

const contactSchema = z.object({
  recordIds: z.array(z.number().int().positive()).optional(),
  examAttendanceIds: z.array(z.number().int().positive()).optional(),
  guardianId: z.number().int().positive().nullable(),
  result: z.enum(["REACHED", "NO_ANSWER", "SMS_SENT", "PARENT_INFORMED"]),
  note: z.string().trim().max(255).optional(),
});

export async function addContactLog(input: z.infer<typeof contactSchema>) {
  const user = await getCurrentUser();
  if (!user) return { error: "Oturum sona erdi, tekrar giriş yapın" };
  const { branch, academicYear } = await getContext();
  if (!branch || !academicYear) return { error: "Kurum veya yıl seçili değil" };

  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const scope = { branchId: branch.id, academicYearId: academicYear.id };
  const base = { guardianId: parsed.data.guardianId, result: parsed.data.result, note: parsed.data.note || null, userId: user.id };

  const [records, examAttendances] = await Promise.all([
    parsed.data.recordIds?.length
      ? prisma.attendanceRecord.findMany({ where: { id: { in: parsed.data.recordIds }, enrollment: scope }, select: { id: true } })
      : [],
    parsed.data.examAttendanceIds?.length
      ? prisma.examAttendance.findMany({ where: { id: { in: parsed.data.examAttendanceIds }, enrollment: scope }, select: { id: true } })
      : [],
  ]);
  if (records.length === 0 && examAttendances.length === 0) return { error: "Kayıt bulunamadı" };

  await prisma.attendanceContactLog.createMany({
    data: [
      ...records.map((record) => ({ recordId: record.id, ...base })),
      ...examAttendances.map((item) => ({ examAttendanceId: item.id, ...base })),
    ],
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteContactLog(id: number) {
  const user = await getCurrentUser();
  if (!user) return { error: "Oturum sona erdi, tekrar giriş yapın" };

  const log = await prisma.attendanceContactLog.findUnique({ where: { id } });
  if (!log) return { error: "Kayıt bulunamadı" };
  if (user.role !== "ADMIN" && log.userId !== user.id) return { error: "Bu kaydı silme yetkiniz yok" };

  await prisma.attendanceContactLog.delete({ where: { id } });
  revalidatePath("/", "layout");
  return { ok: true };
}
