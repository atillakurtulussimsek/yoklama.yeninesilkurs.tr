"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getContext } from "@/lib/context";
import { fullName } from "@/lib/classGroups";
import { normalizePhone } from "@/lib/phone";
import { importK12Workbook, type ImportResult } from "@/lib/studentImport";

export type FormState = { error?: string; ok?: string } | undefined;

async function getScope() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { branch, academicYear } = await getContext();
  if (!branch || !academicYear) return null;
  return { user, branchId: branch.id, academicYearId: academicYear.id };
}

const upper = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleUpperCase("tr-TR");
const optionalText = (max: number) => z.string().trim().max(max).optional();
const NATIONAL_ID = /^\d{11}$/;

/** Değeri boş olmayan alanları döndürür; güncellemede mevcut veriyi boşla ezmemek için. */
function present<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null && value !== undefined && value !== "")) as Partial<T>;
}

// ------------------------------------------------------------
// Öğrenci kaydı
// ------------------------------------------------------------

const studentSchema = z.object({
  enrollmentId: z.coerce.number().int().optional(),
  nationalId: z.string().trim().regex(NATIONAL_ID, "TC kimlik no 11 haneli olmalı"),
  firstName: z.string().trim().min(1, "Ad gerekli").max(100),
  lastName: z.string().trim().min(1, "Soyad gerekli").max(100),
  phone: optionalText(30),
  studentNo: z.coerce.number({ message: "Numara gerekli" }).int().positive("Geçerli bir numara girin"),
  classGroupId: z.coerce.number().int().min(0).optional(),
  field: optionalText(20),
  guardianRelation: z.enum(["MOTHER", "FATHER", "OTHER"]).optional(),
  guardianFirstName: optionalText(100),
  guardianLastName: optionalText(100),
  guardianPhone: optionalText(30),
});

export async function saveStudent(_state: FormState, formData: FormData): Promise<FormState> {
  const scope = await getScope();
  if (!scope) return { error: "Oturum sona erdi" };
  const { branchId, academicYearId } = scope;

  const raw = Object.fromEntries(formData);
  const parsed = studentSchema.safeParse({
    ...raw,
    enrollmentId: raw.enrollmentId || undefined,
    guardianRelation: raw.guardianRelation || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const values = parsed.data;

  const classGroupId = values.classGroupId || null;
  if (classGroupId && !(await prisma.classGroup.findFirst({ where: { id: classGroupId, branchId, academicYearId } }))) {
    return { error: "Sınıf bulunamadı" };
  }

  const studentData = {
    nationalId: values.nationalId,
    firstName: upper(values.firstName),
    lastName: upper(values.lastName),
    phone: normalizePhone(values.phone),
  };
  const enrollmentData = { studentNo: values.studentNo, classGroupId, field: values.field || null };

  const [noOwner, nationalOwner] = await Promise.all([
    prisma.studentEnrollment.findUnique({
      where: { branchId_academicYearId_studentNo: { branchId, academicYearId, studentNo: values.studentNo } },
      include: { student: { select: { firstName: true, lastName: true } } },
    }),
    prisma.student.findUnique({ where: { nationalId: values.nationalId } }),
  ]);

  if (values.enrollmentId) {
    const enrollment = await prisma.studentEnrollment.findFirst({ where: { id: values.enrollmentId, branchId, academicYearId } });
    if (!enrollment) return { error: "Kayıt bulunamadı" };
    if (noOwner && noOwner.id !== enrollment.id) {
      return { error: `${values.studentNo} numarası ${fullName(noOwner.student)} adlı öğrencide kayıtlı` };
    }
    if (nationalOwner && nationalOwner.id !== enrollment.studentId) return { error: "Bu TC kimlik no başka bir öğrencide kayıtlı" };

    await prisma.$transaction([
      prisma.student.update({ where: { id: enrollment.studentId }, data: studentData }),
      prisma.studentEnrollment.update({ where: { id: enrollment.id }, data: enrollmentData }),
    ]);
    revalidatePath("/", "layout");
    return { ok: "Kaydedildi" };
  }

  if (noOwner) return { error: `${values.studentNo} numarası ${fullName(noOwner.student)} adlı öğrencide kayıtlı` };
  if (nationalOwner) {
    const existing = await prisma.studentEnrollment.findUnique({
      where: { studentId_branchId_academicYearId: { studentId: nationalOwner.id, branchId, academicYearId } },
    });
    if (existing) return { error: "Bu öğrenci bu yıl bu kurumda zaten kayıtlı" };
  }

  const created = await prisma.$transaction(async (tx) => {
    const student = nationalOwner
      ? await tx.student.update({ where: { id: nationalOwner.id }, data: studentData })
      : await tx.student.create({ data: studentData });
    const enrollment = await tx.studentEnrollment.create({
      data: { ...enrollmentData, studentId: student.id, branchId, academicYearId },
    });
    if (values.guardianRelation && values.guardianFirstName && values.guardianLastName) {
      const guardian = await tx.guardian.create({
        data: {
          firstName: upper(values.guardianFirstName),
          lastName: upper(values.guardianLastName),
          phone: normalizePhone(values.guardianPhone),
        },
      });
      await tx.studentGuardian.create({
        data: { studentId: student.id, guardianId: guardian.id, relation: values.guardianRelation, contactOrder: 1 },
      });
    }
    return enrollment;
  });

  revalidatePath("/", "layout");
  redirect(`/ogrenciler/${created.id}`);
}

export async function setEnrollmentStatus(id: number, status: "ACTIVE" | "CANCELLED") {
  const scope = await getScope();
  if (!scope) return { error: "Oturum sona erdi" };
  await prisma.studentEnrollment.updateMany({
    where: { id, branchId: scope.branchId, academicYearId: scope.academicYearId },
    data: { status },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteEnrollment(id: number) {
  const scope = await getScope();
  if (scope?.user.role !== "ADMIN") return { error: "Yalnızca yönetici silebilir" };
  await prisma.studentEnrollment.deleteMany({
    where: { id, branchId: scope.branchId, academicYearId: scope.academicYearId },
  });
  revalidatePath("/", "layout");
  redirect("/ogrenciler");
}

// ------------------------------------------------------------
// Veli
// ------------------------------------------------------------

const guardianSchema = z.object({
  studentId: z.coerce.number().int().positive(),
  guardianId: z.coerce.number().int().optional(),
  relation: z.enum(["MOTHER", "FATHER", "OTHER"]),
  firstName: z.string().trim().min(1, "Veli adı gerekli").max(100),
  lastName: z.string().trim().min(1, "Veli soyadı gerekli").max(100),
  phone: optionalText(30),
  nationalId: z.string().trim().regex(NATIONAL_ID, "TC kimlik no 11 haneli olmalı").or(z.literal("")).optional(),
  contactOrder: z.coerce.number().int().min(1).max(9).optional(),
});

async function studentInScope(studentId: number, scope: NonNullable<Awaited<ReturnType<typeof getScope>>>) {
  return prisma.studentEnrollment.findFirst({
    where: { studentId, branchId: scope.branchId, academicYearId: scope.academicYearId },
    select: { id: true },
  });
}

export async function saveGuardian(_state: FormState, formData: FormData): Promise<FormState> {
  const scope = await getScope();
  if (!scope) return { error: "Oturum sona erdi" };

  const raw = Object.fromEntries(formData);
  const parsed = guardianSchema.safeParse({
    ...raw,
    guardianId: raw.guardianId || undefined,
    contactOrder: raw.contactOrder || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const values = parsed.data;
  if (!(await studentInScope(values.studentId, scope))) return { error: "Öğrenci bulunamadı" };

  const nationalId = values.nationalId || null;
  const guardianData = {
    firstName: upper(values.firstName),
    lastName: upper(values.lastName),
    phone: normalizePhone(values.phone),
    nationalId,
  };
  const linkData = {
    relation: values.relation,
    contactOrder: values.contactOrder ?? null,
    receivesSms: formData.get("receivesSms") === "on",
  };

  const tcOwner = nationalId ? await prisma.guardian.findUnique({ where: { nationalId } }) : null;

  if (values.guardianId) {
    const link = await prisma.studentGuardian.findUnique({
      where: { studentId_guardianId: { studentId: values.studentId, guardianId: values.guardianId } },
    });
    if (!link) return { error: "Veli bulunamadı" };
    if (tcOwner && tcOwner.id !== values.guardianId) return { error: "Bu TC kimlik no başka bir velide kayıtlı" };
    await prisma.$transaction([
      prisma.guardian.update({ where: { id: values.guardianId }, data: guardianData }),
      prisma.studentGuardian.update({ where: { id: link.id }, data: linkData }),
    ]);
  } else {
    // Aynı TC'li veli varsa (ör. kardeş kaydı) mevcut veli kullanılır
    const guardian = tcOwner
      ? await prisma.guardian.update({ where: { id: tcOwner.id }, data: present(guardianData) })
      : await prisma.guardian.create({ data: guardianData });
    await prisma.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId: values.studentId, guardianId: guardian.id } },
      create: { studentId: values.studentId, guardianId: guardian.id, ...linkData },
      update: linkData,
    });
  }

  revalidatePath("/", "layout");
  return { ok: "Kaydedildi" };
}

export async function removeGuardian(studentId: number, guardianId: number) {
  const scope = await getScope();
  if (!scope) return { error: "Oturum sona erdi" };
  if (!(await studentInScope(studentId, scope))) return { error: "Öğrenci bulunamadı" };
  await prisma.studentGuardian.deleteMany({ where: { studentId, guardianId } });
  revalidatePath("/", "layout");
  return { ok: true };
}

// ------------------------------------------------------------
// K12 "Öğrenci Bilgilerini Güncelle" Excel aktarımı
// ------------------------------------------------------------

export async function importStudents(_state: ImportResult | undefined, formData: FormData): Promise<ImportResult> {
  const scope = await getScope();
  if (!scope) return { error: "Oturum sona erdi" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Excel dosyası seçin" };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { error: "Yalnızca .xlsx dosyası yüklenebilir" };

  const result = await importK12Workbook(prisma, await file.arrayBuffer(), {
    branchId: scope.branchId,
    academicYearId: scope.academicYearId,
    deactivateMissing: formData.get("deactivateMissing") === "on",
  });
  if (result.summary) revalidatePath("/", "layout");
  return result;
}
