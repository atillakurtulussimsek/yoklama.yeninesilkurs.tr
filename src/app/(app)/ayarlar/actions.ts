"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PROJECT, getCurrentUser } from "@/lib/auth";
import { getContext } from "@/lib/context";
import { isDateStr, toDbDate } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";
import { saveChronicSettings } from "@/lib/settings";
import { getWebhookInfo, isTelegramConfigured, setWebhook } from "@/lib/telegram";

export type ActionState = { error?: string; ok?: string } | undefined;

async function ensureAdmin() {
  const user = await getCurrentUser();
  return user?.role === "ADMIN" ? user : null;
}

async function currentBranchId() {
  return (await getContext()).branch?.id ?? null;
}

// ------------------------------------------------------------
// Yoklama ayarları (seçili kurum)
// ------------------------------------------------------------

const chronicSchema = z.object({
  windowDays: z.coerce.number().int().min(1, "Gün sayısı en az 1").max(365),
  absenceThreshold: z.coerce.number().int().min(1, "Eşik en az 1").max(365),
  consecutiveThreshold: z.coerce.number().int().min(1, "Üst üste gün en az 1").max(365),
});

export async function updateChronicSettings(_state: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await ensureAdmin())) return { error: "Yetkiniz yok" };
  const branchId = await currentBranchId();
  if (!branchId) return { error: "Kurum seçili değil" };
  const parsed = chronicSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await saveChronicSettings(branchId, parsed.data);
  revalidatePath("/", "layout");
  return { ok: "Kaydedildi" };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const lessonSchema = z.object({
  id: z.coerce.number().int().optional(),
  orderNo: z.coerce.number().int().min(1, "Sıra en az 1"),
  name: z.string().trim().min(1, "Ders adı gerekli").max(50),
  session: z.enum(["MORNING", "AFTERNOON"]),
  startTime: z.string().regex(TIME, "Başlangıç saati SS:DD olmalı").or(z.literal("")),
  endTime: z.string().regex(TIME, "Bitiş saati SS:DD olmalı").or(z.literal("")),
});

export async function saveLesson(_state: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await ensureAdmin())) return { error: "Yetkiniz yok" };
  const branchId = await currentBranchId();
  if (!branchId) return { error: "Kurum seçili değil" };
  const raw = Object.fromEntries(formData);
  const parsed = lessonSchema.safeParse({ ...raw, id: raw.id || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...values } = parsed.data;
  const data = { ...values, startTime: values.startTime || null, endTime: values.endTime || null };

  if (id) await prisma.lessonPeriod.updateMany({ where: { id, branchId }, data });
  else await prisma.lessonPeriod.create({ data: { ...data, branchId } });

  revalidatePath("/", "layout");
  return { ok: id ? "Güncellendi" : "Eklendi" };
}

export async function removeLesson(id: number) {
  if (!(await ensureAdmin())) return { error: "Yetkiniz yok" };
  const branchId = await currentBranchId();
  if (!branchId) return { error: "Kurum seçili değil" };
  const used = await prisma.attendanceRecord.count({ where: { lessonPeriodId: id } });
  // Kullanılmış ders silinmez, geçmiş raporlar bozulmasın diye pasif yapılır
  if (used > 0) await prisma.lessonPeriod.updateMany({ where: { id, branchId }, data: { isActive: false } });
  else await prisma.lessonPeriod.deleteMany({ where: { id, branchId } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function restoreLesson(id: number) {
  if (!(await ensureAdmin())) return { error: "Yetkiniz yok" };
  const branchId = await currentBranchId();
  if (!branchId) return { error: "Kurum seçili değil" };
  await prisma.lessonPeriod.updateMany({ where: { id, branchId }, data: { isActive: true } });
  revalidatePath("/", "layout");
  return { ok: true };
}

// ------------------------------------------------------------
// Yapay zeka (kurum bazlı) ve Telegram
// ------------------------------------------------------------

const aiSchema = z.object({
  baseUrl: z.string().trim().url("Geçerli bir URL girin").max(255),
  model: z.string().trim().min(1, "Model gerekli").max(100),
  apiKey: z.string().trim().max(255).optional(),
});

export async function updateAiSettings(_state: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await ensureAdmin())) return { error: "Yetkiniz yok" };
  const branchId = await currentBranchId();
  if (!branchId) return { error: "Kurum seçili değil" };
  const parsed = aiSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { baseUrl, model, apiKey } = parsed.data;

  const existing = await prisma.branchAiSetting.findUnique({ where: { branchId } });
  if (!existing && !apiKey) return { error: "API anahtarı gerekli" };

  await prisma.branchAiSetting.upsert({
    where: { branchId },
    create: { branchId, baseUrl: baseUrl.replace(/\/+$/, ""), model, apiKey: apiKey! },
    update: { baseUrl: baseUrl.replace(/\/+$/, ""), model, ...(apiKey ? { apiKey } : {}) },
  });
  revalidatePath("/ayarlar");
  return { ok: "Kaydedildi" };
}

export async function setupTelegramWebhook(): Promise<{ ok?: string; error?: string }> {
  if (!(await ensureAdmin())) return { error: "Yetkiniz yok" };
  if (!isTelegramConfigured()) return { error: "TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET tanımlı değil" };
  const appUrl = process.env.APP_URL?.replace(/\/+$/, "");
  if (!appUrl?.startsWith("https://")) return { error: "APP_URL https ile başlayan dış adres olmalı" };
  try {
    await setWebhook(`${appUrl}/api/telegram/webhook`);
    const info = await getWebhookInfo();
    return { ok: `Webhook kuruldu (${info.url}). Bekleyen: ${info.pending_update_count}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Webhook kurulamadı" };
  }
}

// ------------------------------------------------------------
// Kurumlar ve eğitim-öğretim yılları (ortak tablolar)
// ------------------------------------------------------------

function slugify(value: string) {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", i: "i", ö: "o", ş: "s", ü: "u" };
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıiöşü]/g, (char) => map[char] ?? char)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

const branchSchema = z.object({
  id: z.coerce.number().int().optional(),
  name: z.string().trim().min(2, "Kurum adı gerekli").max(150),
  address: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(30).optional(),
});

export async function saveBranch(_state: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await ensureAdmin())) return { error: "Yetkiniz yok" };
  const raw = Object.fromEntries(formData);
  const parsed = branchSchema.safeParse({ ...raw, id: raw.id || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...values } = parsed.data;
  const data = {
    name: values.name,
    address: values.address || null,
    phone: normalizePhone(values.phone),
    isActive: id ? formData.get("isActive") === "on" : true,
  };

  if (id) {
    await prisma.branch.update({ where: { id }, data });
  } else {
    const base = slugify(values.name) || "kurum";
    let slug = base;
    for (let i = 2; await prisma.branch.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    await prisma.branch.create({ data: { ...data, slug } });
  }

  revalidatePath("/", "layout");
  return { ok: id ? "Güncellendi" : "Eklendi" };
}

const optionalDate = z.string().refine(isDateStr, "Geçersiz tarih").or(z.literal("")).optional();

const yearSchema = z
  .object({
    id: z.coerce.number().int().optional(),
    name: z.string().trim().regex(/^\d{4}-\d{4}$/, "Yıl adı 2026-2027 biçiminde olmalı"),
    startsOn: z.string().refine(isDateStr, "Başlangıç tarihi gerekli"),
    endsOn: optionalDate,
  })
  .refine((value) => !value.endsOn || value.startsOn < value.endsOn, "Bitiş tarihi başlangıçtan sonra olmalı");

export async function saveAcademicYear(_state: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await ensureAdmin())) return { error: "Yetkiniz yok" };
  const raw = Object.fromEntries(formData);
  const parsed = yearSchema.safeParse({ ...raw, id: raw.id || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, name, startsOn, endsOn } = parsed.data;

  const duplicate = await prisma.academicYear.findUnique({ where: { name } });
  if (duplicate && duplicate.id !== id) return { error: `${name} zaten tanımlı` };

  const isCurrent = formData.get("isCurrent") === "on";
  const data = { name, startsOn: toDbDate(startsOn), endsOn: endsOn ? toDbDate(endsOn) : null, isCurrent };

  await prisma.$transaction(async (tx) => {
    const year = id
      ? await tx.academicYear.update({ where: { id }, data })
      : await tx.academicYear.create({ data });
    if (isCurrent) await tx.academicYear.updateMany({ where: { id: { not: year.id } }, data: { isCurrent: false } });
  });

  revalidatePath("/", "layout");
  return { ok: id ? "Güncellendi" : "Eklendi" };
}

const termSchema = z
  .object({
    id: z.coerce.number().int().optional(),
    academicYearId: z.coerce.number().int().positive(),
    name: z.string().trim().min(1, "Dönem adı gerekli").max(50),
    startsOn: z.string().refine(isDateStr, "Başlangıç tarihi gerekli"),
    endsOn: optionalDate,
  })
  .refine((value) => !value.endsOn || value.startsOn <= value.endsOn, "Bitiş tarihi başlangıçtan önce olamaz");

export async function saveTerm(_state: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await ensureAdmin())) return { error: "Yetkiniz yok" };
  const raw = Object.fromEntries(formData);
  const parsed = termSchema.safeParse({ ...raw, id: raw.id || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, academicYearId, name, startsOn, endsOn } = parsed.data;

  const duplicate = await prisma.academicTerm.findUnique({ where: { academicYearId_name: { academicYearId, name } } });
  if (duplicate && duplicate.id !== id) return { error: `"${name}" bu yılda zaten tanımlı` };

  const data = { name, startsOn: toDbDate(startsOn), endsOn: endsOn ? toDbDate(endsOn) : null };
  if (id) await prisma.academicTerm.updateMany({ where: { id, academicYearId }, data });
  else await prisma.academicTerm.create({ data: { ...data, academicYearId } });

  revalidatePath("/", "layout");
  return { ok: id ? "Güncellendi" : "Eklendi" };
}

export async function deleteTerm(id: number) {
  if (!(await ensureAdmin())) return { error: "Yetkiniz yok" };
  await prisma.academicTerm.deleteMany({ where: { id } });
  revalidatePath("/", "layout");
  return { ok: true };
}

// ------------------------------------------------------------
// Kullanıcılar (ortak users + yoklama rolü)
// ------------------------------------------------------------

const userSchema = z.object({
  fullName: z.string().trim().min(2, "Ad soyad gerekli").max(100),
  username: z
    .string()
    .trim()
    .min(3, "Kullanıcı adı en az 3 karakter olmalı")
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, "Kullanıcı adında yalnızca harf, rakam, . _ - kullanılabilir"),
  password: z.string().optional(),
  role: z.enum(["ADMIN", "STAFF"]),
});

export async function assignUser(_state: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await ensureAdmin())) return { error: "Yetkiniz yok" };
  const parsed = userSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const username = parsed.data.username.toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { username },
    include: { projectRoles: { where: { project: PROJECT } } },
  });

  if (existing) {
    if (existing.projectRoles.length > 0) return { error: "Bu kullanıcının yoklama erişimi zaten var" };
    await prisma.userProjectRole.create({ data: { userId: existing.id, project: PROJECT, role: parsed.data.role } });
    revalidatePath("/ayarlar/kullanicilar");
    return { ok: `${existing.fullName} adlı mevcut kullanıcıya yoklama erişimi verildi (şifresi değişmedi)` };
  }

  const password = parsed.data.password ?? "";
  if (password.length < 8) return { error: "Yeni kullanıcı için en az 8 karakterli şifre gerekli" };

  await prisma.user.create({
    data: {
      fullName: parsed.data.fullName,
      username,
      passwordHash: await bcrypt.hash(password, 10),
      projectRoles: { create: { project: PROJECT, role: parsed.data.role } },
    },
  });
  revalidatePath("/ayarlar/kullanicilar");
  return { ok: "Kullanıcı oluşturuldu" };
}

export async function updateUserAccess(
  userId: number,
  patch: { role?: "ADMIN" | "STAFF"; remove?: boolean; password?: string },
) {
  const admin = await ensureAdmin();
  if (!admin) return { error: "Yetkiniz yok" };
  if (userId === admin.id && (patch.remove || patch.role === "STAFF")) {
    return { error: "Kendi erişiminizi kaldıramaz veya yetkinizi düşüremezsiniz" };
  }

  if (patch.remove) {
    await prisma.userProjectRole.deleteMany({ where: { userId, project: PROJECT } });
  } else if (patch.role) {
    await prisma.userProjectRole.updateMany({ where: { userId, project: PROJECT }, data: { role: patch.role } });
  } else if (patch.password !== undefined) {
    if (patch.password.length < 8) return { error: "Şifre en az 8 karakter olmalı" };
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(patch.password, 10) } });
  }

  revalidatePath("/ayarlar/kullanicilar");
  return { ok: true };
}
