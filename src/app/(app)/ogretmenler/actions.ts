"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getContext } from "@/lib/context";
import { normalizePhone } from "@/lib/phone";
import { generateLinkCode, linkCodeExpiry } from "@/lib/slipProcessing";

export type ActionState = { error?: string; ok?: string } | undefined;

async function adminScope() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return null;
  const { branch } = await getContext();
  return branch ? { user, branchId: branch.id } : null;
}

const teacherSchema = z.object({
  id: z.coerce.number().int().optional(),
  firstName: z.string().trim().min(1, "Ad gerekli").max(100),
  lastName: z.string().trim().min(1, "Soyad gerekli").max(100),
  subject: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email("Geçersiz e-posta").max(150).or(z.literal("")).optional(),
});

export async function saveTeacher(_state: ActionState, formData: FormData): Promise<ActionState> {
  const scope = await adminScope();
  if (!scope) return { error: "Yetkiniz yok" };
  const raw = Object.fromEntries(formData);
  const parsed = teacherSchema.safeParse({ ...raw, id: raw.id || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...values } = parsed.data;
  const upper = (value: string) => value.replace(/\s+/g, " ").toLocaleUpperCase("tr-TR");
  const data = {
    firstName: upper(values.firstName),
    lastName: upper(values.lastName),
    subject: values.subject || null,
    phone: normalizePhone(values.phone),
    email: values.email || null,
    ...(id ? { isActive: formData.get("isActive") === "on" } : {}),
  };

  if (id) await prisma.teacher.updateMany({ where: { id, branchId: scope.branchId }, data });
  else await prisma.teacher.create({ data: { ...data, branchId: scope.branchId } });

  revalidatePath("/ogretmenler");
  return { ok: id ? "Güncellendi" : "Eklendi" };
}

export async function deleteTeacher(id: number) {
  const scope = await adminScope();
  if (!scope) return { error: "Yetkiniz yok" };
  const used = await prisma.attendanceRecord.count({ where: { teacherId: id } });
  if (used > 0) {
    await prisma.teacher.updateMany({ where: { id, branchId: scope.branchId }, data: { isActive: false } });
  } else {
    await prisma.teacher.deleteMany({ where: { id, branchId: scope.branchId } });
  }
  revalidatePath("/ogretmenler");
  return { ok: true };
}

/** Öğretmen veya kullanıcı için 15 dk geçerli Telegram bağlantı kodu üretir. */
export async function createTelegramLinkCode(target: { teacherId: number } | { userId: number }) {
  const scope = await adminScope();
  if (!scope) return { error: "Yetkiniz yok" };

  if ("teacherId" in target) {
    const teacher = await prisma.teacher.findFirst({ where: { id: target.teacherId, branchId: scope.branchId } });
    if (!teacher) return { error: "Öğretmen bulunamadı" };
  } else {
    const user = await prisma.user.findUnique({ where: { id: target.userId } });
    if (!user) return { error: "Kullanıcı bulunamadı" };
  }

  // Aynı kişinin kullanılmamış eski kodlarını geçersiz kıl
  await prisma.telegramLinkCode.deleteMany({ where: { ...target, usedAt: null } });

  let code = generateLinkCode();
  while (await prisma.telegramLinkCode.findUnique({ where: { code } })) code = generateLinkCode();

  await prisma.telegramLinkCode.create({
    data: { code, branchId: scope.branchId, ...target, expiresAt: linkCodeExpiry() },
  });
  return { ok: true, code };
}

export async function unlinkTelegram(target: { teacherId: number } | { userId: number }) {
  const scope = await adminScope();
  if (!scope) return { error: "Yetkiniz yok" };
  await prisma.telegramAccount.deleteMany({ where: target });
  revalidatePath("/", "layout");
  return { ok: true };
}
