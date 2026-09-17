"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { prepareImage } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { getContext } from "@/lib/context";
import { isDateStr } from "@/lib/dates";
import { analyzeSlip, applySlip } from "@/lib/slipCore";

const MAX_FILES = 30;
const MAX_SIZE = 15 * 1024 * 1024;

async function scope() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { branch, academicYear } = await getContext();
  return branch && academicYear ? { user, branchId: branch.id, academicYearId: academicYear.id } : null;
}

export type UploadState = { error?: string; ok?: string } | undefined;

/** Toplu fiş yükler; görseller küçültülüp saklanır, çözümleme yanıt döndükten sonra sırayla çalışır. */
export async function uploadSlips(_state: UploadState, formData: FormData): Promise<UploadState> {
  const current = await scope();
  if (!current) return { error: "Oturum sona erdi" };

  const files = formData.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length === 0) return { error: "En az bir görsel seçin" };
  if (files.length > MAX_FILES) return { error: `Tek seferde en fazla ${MAX_FILES} görsel yüklenebilir` };

  const dateOverride = formData.get("tarih");
  const date = isDateStr(dateOverride) ? dateOverride : null;
  const created: number[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      skipped.push(`${file.name}: görsel değil`);
      continue;
    }
    if (file.size > MAX_SIZE) {
      skipped.push(`${file.name}: 15 MB üstü`);
      continue;
    }
    const raw = Buffer.from(await file.arrayBuffer()).toString("base64");
    const image = await prepareImage(raw);
    if (!image) {
      skipped.push(`${file.name}: görsel okunamadı`);
      continue;
    }
    const slip = await prisma.attendanceSlip.create({
      data: {
        branchId: current.branchId,
        academicYearId: current.academicYearId,
        source: "WEB",
        status: "ANALYZING",
        userId: current.user.id,
        fileName: file.name.slice(0, 255),
        imageMime: image.mime,
        imageData: Buffer.from(image.base64, "base64"),
      },
      select: { id: true },
    });
    created.push(slip.id);
  }

  if (created.length) {
    after(async () => {
      for (const id of created) {
        try {
          await runAnalysis(id, date);
        } catch (error) {
          console.error(`Fiş #${id} çözümlenemedi`, error);
        }
      }
    });
  }

  revalidatePath("/yoklama-fisleri");
  const ok = `${created.length} fiş yüklendi, çözümleme başladı.`;
  return skipped.length ? { ok, error: `Atlanan: ${skipped.join("; ")}` } : { ok };
}

async function runAnalysis(id: number, date: string | null) {
  const slip = await prisma.attendanceSlip.findUnique({ where: { id }, select: { imageData: true, imageMime: true } });
  if (!slip?.imageData) {
    await prisma.attendanceSlip.update({ where: { id }, data: { status: "FAILED", errorMessage: "Görsel bulunamadı" } });
    return;
  }
  await analyzeSlip(id, { base64: Buffer.from(slip.imageData).toString("base64"), mime: slip.imageMime ?? "image/jpeg" }, { dateOverride: date });
}

const reviewSchema = z.object({
  id: z.number().int().positive(),
  classGroupId: z.number().int().positive().optional(),
  date: z.string().refine(isDateStr, "Geçersiz tarih").optional(),
});

export async function approveSlip(input: z.infer<typeof reviewSchema>) {
  const current = await scope();
  if (!current) return { error: "Oturum sona erdi" };
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const slip = await prisma.attendanceSlip.findFirst({
    where: { id: parsed.data.id, branchId: current.branchId, academicYearId: current.academicYearId },
    select: { id: true },
  });
  if (!slip) return { error: "Fiş bulunamadı" };

  const result = await applySlip(slip.id, { userId: current.user.id }, {
    classGroupId: parsed.data.classGroupId,
    date: parsed.data.date,
    reviewedById: current.user.id,
  });
  revalidatePath("/", "layout");
  return "error" in result ? { error: result.error } : { ok: true, markedTotal: result.markedTotal };
}

export async function rejectSlip(id: number) {
  const current = await scope();
  if (!current) return { error: "Oturum sona erdi" };
  await prisma.attendanceSlip.updateMany({
    where: { id, branchId: current.branchId, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "CANCELLED", reviewedById: current.user.id },
  });
  revalidatePath("/yoklama-fisleri");
  return { ok: true };
}

/** Başarısız veya iptal edilmiş web fişini yeniden çözümler. */
export async function reanalyzeSlip(id: number) {
  const current = await scope();
  if (!current) return { error: "Oturum sona erdi" };
  const slip = await prisma.attendanceSlip.findFirst({
    where: { id, branchId: current.branchId, source: "WEB", status: { in: ["PENDING", "FAILED", "CANCELLED"] } },
    select: { id: true },
  });
  if (!slip) return { error: "Fiş bulunamadı veya yeniden çözümlenemez" };
  await prisma.attendanceSlip.update({ where: { id }, data: { status: "ANALYZING", errorMessage: null } });
  after(() => runAnalysis(id, null).catch((error) => console.error(`Fiş #${id} çözümlenemedi`, error)));
  revalidatePath("/yoklama-fisleri");
  return { ok: true };
}

export async function deleteSlip(id: number) {
  const current = await scope();
  if (current?.user.role !== "ADMIN") return { error: "Yalnızca yönetici silebilir" };
  await prisma.attendanceSlip.deleteMany({ where: { id, branchId: current.branchId, status: { not: "APPLIED" } } });
  revalidatePath("/yoklama-fisleri");
  return { ok: true };
}
