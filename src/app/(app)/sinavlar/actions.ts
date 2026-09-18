"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getContext } from "@/lib/context";
import { isDateStr, toDbDate } from "@/lib/dates";

export type ActionState = { error?: string; ok?: string } | undefined;

async function scope() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { branch, academicYear } = await getContext();
  return branch && academicYear ? { user, branchId: branch.id, academicYearId: academicYear.id } : null;
}

const examSchema = z.object({
  id: z.coerce.number().int().optional(),
  name: z.string().trim().min(2, "Sınav adı gerekli").max(150),
  date: z.string().refine(isDateStr, "Tarih gerekli"),
  note: z.string().trim().max(255).optional(),
});

export async function saveExam(_state: ActionState, formData: FormData): Promise<ActionState> {
  const current = await scope();
  if (!current) return { error: "Oturum sona erdi" };
  const raw = Object.fromEntries(formData);
  const parsed = examSchema.safeParse({ ...raw, id: raw.id || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, name, date, note } = parsed.data;
  const classGroupIds = formData
    .getAll("classGroupIds")
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0);

  const data = { name, date: toDbDate(date), note: note || null };
  let examId = id;
  if (id) {
    const existing = await prisma.exam.findFirst({ where: { id, branchId: current.branchId, academicYearId: current.academicYearId } });
    if (!existing) return { error: "Sınav bulunamadı" };
    await prisma.$transaction([
      prisma.exam.update({ where: { id }, data }),
      prisma.examClassGroup.deleteMany({ where: { examId: id } }),
      ...(classGroupIds.length
        ? [prisma.examClassGroup.createMany({ data: classGroupIds.map((classGroupId) => ({ examId: id, classGroupId })) })]
        : []),
    ]);
  } else {
    const exam = await prisma.exam.create({
      data: {
        ...data,
        branchId: current.branchId,
        academicYearId: current.academicYearId,
        createdById: current.user.id,
        classGroups: { create: classGroupIds.map((classGroupId) => ({ classGroupId })) },
      },
    });
    examId = exam.id;
  }

  revalidatePath("/sinavlar");
  if (!id) redirect(`/sinavlar/${examId}`);
  return { ok: "Kaydedildi" };
}

export async function deleteExam(id: number) {
  const current = await scope();
  if (current?.user.role !== "ADMIN") return { error: "Yalnızca yönetici silebilir" };
  await prisma.exam.deleteMany({ where: { id, branchId: current.branchId } });
  revalidatePath("/sinavlar");
  redirect("/sinavlar");
}

const attendanceSchema = z.object({
  examId: z.number().int().positive(),
  entries: z
    .array(
      z.object({
        enrollmentId: z.number().int().positive(),
        status: z.enum(["ABSENT", "LATE", "EARLY_LEAVE", "EXCUSED"]).nullable(),
        note: z.string().trim().max(255).optional(),
      }),
    )
    .min(1),
});

/** Sınav yoklamasını kaydeder: işaretsizler katıldı sayılır (kayıt silinir), işaretliler upsert edilir. */
export async function saveExamAttendance(input: z.infer<typeof attendanceSchema>) {
  const current = await scope();
  if (!current) return { error: "Oturum sona erdi" };
  const parsed = attendanceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { examId, entries } = parsed.data;

  const exam = await prisma.exam.findFirst({ where: { id: examId, branchId: current.branchId, academicYearId: current.academicYearId } });
  if (!exam) return { error: "Sınav bulunamadı" };

  const enrollments = await prisma.studentEnrollment.findMany({
    where: { id: { in: entries.map((entry) => entry.enrollmentId) }, branchId: current.branchId, academicYearId: current.academicYearId },
    select: { id: true, classGroupId: true },
  });
  const validIds = new Set(enrollments.map((item) => item.id));
  const valid = entries.filter((entry) => validIds.has(entry.enrollmentId));
  const presentIds = valid.filter((entry) => !entry.status).map((entry) => entry.enrollmentId);
  const marked = valid.filter((entry) => entry.status);
  const classGroupIds = [...new Set(enrollments.map((item) => item.classGroupId).filter((id): id is number => id !== null))];

  await prisma.$transaction([
    prisma.examAttendance.deleteMany({ where: { examId, enrollmentId: { in: presentIds } } }),
    ...marked.map((entry) =>
      prisma.examAttendance.upsert({
        where: { examId_enrollmentId: { examId, enrollmentId: entry.enrollmentId } },
        create: { examId, enrollmentId: entry.enrollmentId, status: entry.status!, note: entry.note || null, createdById: current.user.id },
        update: { status: entry.status!, note: entry.note || null },
      }),
    ),
    ...classGroupIds.map((classGroupId) =>
      prisma.examSession.upsert({
        where: { examId_classGroupId: { examId, classGroupId } },
        create: { examId, classGroupId, takenById: current.user.id },
        update: { takenById: current.user.id },
      }),
    ),
  ]);

  revalidatePath(`/sinavlar/${examId}`);
  revalidatePath("/sinavlar");
  return { ok: true, markedCount: marked.length };
}
