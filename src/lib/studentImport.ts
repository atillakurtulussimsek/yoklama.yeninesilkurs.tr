import * as XLSX from "xlsx";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Gender, GuardianRelation } from "@/generated/prisma/enums";
import { fullName, parseClassText } from "@/lib/classGroups";
import { parseTrDate } from "@/lib/dates";
import { normalizePhone } from "@/lib/phone";

// K12 "Öğrenci Bilgilerini Güncelle" Excel aktarımı

export type ImportSummary = {
  studentsCreated: number;
  studentsUpdated: number;
  enrollmentsCreated: number;
  enrollmentsUpdated: number;
  classGroupsCreated: number;
  guardiansCreated: number;
  cancelled: number;
};

export type ImportResult = { error?: string; summary?: ImportSummary; skipped?: { row: number; reason: string }[] };

const STUDENT_HEADERS = {
  externalId: "EnrollmentID",
  nationalId: "Oğr Kimlik",
  studentNo: "Oğr No",
  firstName: "Oğr Adı",
  lastName: "Oğr Soyadı",
  enrollmentType: "Kayıt Türü",
  enrolledOn: "Kayıt Tarihi",
  gradeLevel: "Sınıf Seviyesi",
  section: "Şube",
  field: "Alanı",
  phone: "Öğrenci Mesaj Gönderi (Cep Tel)",
  birthDate: "Oğr Doğum Tarihi",
  gender: "Oğr Cinsiyet",
  email: "Öğrenci 1. E-Posta Adresi",
} as const;

const GUARDIAN_HEADERS = [
  {
    relation: "FATHER",
    nationalId: "Baba Tc Kimlik",
    firstName: "Baba Adı",
    lastName: "Baba Soyadı",
    sms: "Veli SMS Alsın (Baba)",
    order: "Baba Ulaşım Sırası",
    phone: "Baba Mesaj Gönderi (Cep Tel)",
    email: "Baba 1. E-Posta Adresi",
  },
  {
    relation: "MOTHER",
    nationalId: "Anne Tc Kimlik",
    firstName: "Anne Adı",
    lastName: "Anne Soyadı",
    sms: "Veli SMS Alsın (Anne)",
    order: "Anne Ulaşım Sırası",
    phone: "Anne Mesaj Gönderi (Cep Tel)",
    email: "Anne 1. E-Posta Adresi",
  },
] as const;

const REQUIRED_HEADERS = ["nationalId", "studentNo", "firstName", "lastName", "section"] as const;

type ParsedGuardian = {
  relation: GuardianRelation;
  nationalId: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  receivesSms: boolean;
  contactOrder: number | null;
};

type ParsedRow = {
  row: number;
  externalId: string | null;
  nationalId: string;
  studentNo: number;
  firstName: string;
  lastName: string;
  enrollmentType: string | null;
  enrolledOn: Date | null;
  gradeLevel: string;
  className: string;
  field: string | null;
  phone: string | null;
  birthDate: Date | null;
  gender: Gender | null;
  email: string | null;
  guardians: ParsedGuardian[];
};

/** K12 dosyasının "dimension" bilgisi yanlış (A1:J2); aralığı gerçek hücrelerden hesaplar. */
function actualRange(sheet: XLSX.WorkSheet) {
  const range = { s: { r: Infinity, c: Infinity }, e: { r: 0, c: 0 } };
  for (const key of Object.keys(sheet)) {
    if (key.startsWith("!")) continue;
    const cell = XLSX.utils.decode_cell(key);
    range.s.r = Math.min(range.s.r, cell.r);
    range.s.c = Math.min(range.s.c, cell.c);
    range.e.r = Math.max(range.e.r, cell.r);
    range.e.c = Math.max(range.e.c, cell.c);
  }
  return range.s.r === Infinity ? sheet["!ref"] : XLSX.utils.encode_range(range);
}

/** SheetJS hücre değerini metne çevirir (tarihler ISO olarak). */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

const upper = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleUpperCase("tr-TR");
const normalizeHeader = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
const toEmail = (value: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value.toLowerCase().slice(0, 150) : null);
const toNationalId = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
};

/** Değeri boş olmayan alanları döndürür; güncellemede mevcut veriyi boşla ezmemek için. */
function present<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== null && value !== undefined && value !== ""),
  ) as Partial<T>;
}

export async function importK12Workbook(
  prisma: PrismaClient,
  buffer: ArrayBuffer,
  options: { branchId: number; academicYearId: number; deactivateMissing: boolean },
): Promise<ImportResult> {
  const { branchId, academicYearId } = options;

  // K12 dosyaları ExcelJS ile açılamıyor; SheetJS daha toleranslı
  let sheetRows: unknown[][];
  try {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return { error: "Dosyada sayfa bulunamadı" };
    sheet["!ref"] = actualRange(sheet);
    sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  } catch {
    return { error: "Dosya okunamadı. Excel'de .xlsx olarak kaydedip tekrar deneyin." };
  }

  // Başlık satırını ilk 5 satırda ara
  let headerRow = 0;
  const columnIndex = new Map<string, number>();
  for (let rowNo = 1; rowNo <= Math.min(5, sheetRows.length); rowNo++) {
    const values = sheetRows[rowNo - 1] ?? [];
    const map = new Map<string, number>();
    values.forEach((value, index) => {
      const header = normalizeHeader(cellText(value));
      if (header && !map.has(header)) map.set(header, index);
    });
    if (REQUIRED_HEADERS.every((key) => map.has(normalizeHeader(STUDENT_HEADERS[key])))) {
      headerRow = rowNo;
      map.forEach((index, header) => columnIndex.set(header, index));
      break;
    }
  }
  if (!headerRow) {
    return {
      error:
        "Başlık satırı bulunamadı. K12 'Öğrenci Bilgilerini Güncelle' dosyası olmalı (Oğr Kimlik, Oğr No, Oğr Adı, Oğr Soyadı, Şube).",
    };
  }

  const skipped: { row: number; reason: string }[] = [];
  const rows: ParsedRow[] = [];
  const allFileNos = new Set<number>();
  const seenNos = new Map<number, number>();
  const seenNationalIds = new Map<string, number>();

  for (let rowNo = headerRow + 1; rowNo <= sheetRows.length; rowNo++) {
    const values = sheetRows[rowNo - 1] ?? [];
    const raw = (header: string) => {
      const index = columnIndex.get(normalizeHeader(header));
      return index === undefined ? null : values[index];
    };
    const text = (header: string) => cellText(raw(header));

    const nationalIdText = text(STUDENT_HEADERS.nationalId);
    const firstName = upper(text(STUDENT_HEADERS.firstName));
    const lastName = upper(text(STUDENT_HEADERS.lastName));
    if (!nationalIdText && !firstName && !lastName) continue;

    const studentNo = Number(text(STUDENT_HEADERS.studentNo));
    if (Number.isInteger(studentNo) && studentNo > 0) allFileNos.add(studentNo);
    const label = `${firstName} ${lastName}`.trim();

    const nationalId = toNationalId(nationalIdText);
    if (!nationalId) {
      skipped.push({ row: rowNo, reason: `${label}: TC kimlik no geçersiz` });
      continue;
    }
    if (!Number.isInteger(studentNo) || studentNo <= 0) {
      skipped.push({ row: rowNo, reason: `${label}: öğrenci numarası geçersiz` });
      continue;
    }
    if (!firstName || !lastName) {
      skipped.push({ row: rowNo, reason: `${nationalId}: ad veya soyad boş` });
      continue;
    }
    const classParts = parseClassText(text(STUDENT_HEADERS.section), text(STUDENT_HEADERS.gradeLevel));
    if (!classParts) {
      skipped.push({ row: rowNo, reason: `${label}: şube boş` });
      continue;
    }
    if (seenNos.has(studentNo)) {
      skipped.push({ row: rowNo, reason: `${label}: ${studentNo} numarası ${seenNos.get(studentNo)}. satırda da var` });
      continue;
    }
    if (seenNationalIds.has(nationalId)) {
      skipped.push({ row: rowNo, reason: `${label}: TC kimlik no ${seenNationalIds.get(nationalId)}. satırda da var` });
      continue;
    }
    seenNos.set(studentNo, rowNo);
    seenNationalIds.set(nationalId, rowNo);

    const genderText = text(STUDENT_HEADERS.gender).toLocaleLowerCase("tr-TR");
    const guardians: ParsedGuardian[] = [];
    for (const spec of GUARDIAN_HEADERS) {
      const guardianFirstName = upper(text(spec.firstName));
      const guardianLastName = upper(text(spec.lastName));
      if (!guardianFirstName || !guardianLastName) continue;
      const order = Number(text(spec.order));
      guardians.push({
        relation: spec.relation,
        nationalId: toNationalId(text(spec.nationalId)),
        firstName: guardianFirstName.slice(0, 100),
        lastName: guardianLastName.slice(0, 100),
        phone: normalizePhone(text(spec.phone)),
        email: toEmail(text(spec.email)),
        receivesSms: text(spec.sms).toLocaleLowerCase("tr-TR") !== "hayır",
        contactOrder: Number.isInteger(order) && order > 0 ? order : null,
      });
    }

    rows.push({
      row: rowNo,
      externalId: text(STUDENT_HEADERS.externalId).slice(0, 64) || null,
      nationalId,
      studentNo,
      firstName: firstName.slice(0, 100),
      lastName: lastName.slice(0, 100),
      enrollmentType: text(STUDENT_HEADERS.enrollmentType).slice(0, 30) || null,
      enrolledOn: parseTrDate(raw(STUDENT_HEADERS.enrolledOn)),
      gradeLevel: classParts.gradeLevel.slice(0, 20),
      className: classParts.name.slice(0, 30),
      field: text(STUDENT_HEADERS.field).slice(0, 20) || null,
      phone: normalizePhone(text(STUDENT_HEADERS.phone)),
      birthDate: parseTrDate(raw(STUDENT_HEADERS.birthDate)),
      gender: genderText === "erkek" ? "MALE" : genderText === "kız" ? "FEMALE" : null,
      email: toEmail(text(STUDENT_HEADERS.email)),
      guardians,
    });
  }

  if (rows.length === 0) {
    return { error: skipped.length ? "Aktarılacak geçerli satır bulunamadı" : "Dosyada öğrenci satırı yok (yalnızca başlık var)", skipped };
  }

  const summary: ImportSummary = {
    studentsCreated: 0,
    studentsUpdated: 0,
    enrollmentsCreated: 0,
    enrollmentsUpdated: 0,
    classGroupsCreated: 0,
    guardiansCreated: 0,
    cancelled: 0,
  };
  const dbSkipped: { row: number; reason: string }[] = [];

  // Uzak veritabanında her sorgu pahalı; mevcut kayıtları toplu oku, döngüde yalnızca yaz
  const nationalIds = rows.map((row) => row.nationalId);
  const guardianNationalIds = rows.flatMap((row) => row.guardians.map((g) => g.nationalId)).filter((id): id is string => !!id);
  const guardianPhones = rows.flatMap((row) => row.guardians.map((g) => g.phone)).filter((p): p is string => !!p);
  const externalIds = rows.map((row) => row.externalId).filter((id): id is string => !!id);

  const [groups, existingStudents, existingEnrollments, guardiansByTc, guardiansByPhone, externalOwners] = await Promise.all([
    prisma.classGroup.findMany({ where: { branchId, academicYearId } }),
    prisma.student.findMany({
      where: { nationalId: { in: nationalIds } },
      select: { id: true, nationalId: true, guardians: { select: { guardianId: true, relation: true, guardian: { select: { nationalId: true } } } } },
    }),
    prisma.studentEnrollment.findMany({
      where: { branchId, academicYearId },
      select: { id: true, studentId: true, studentNo: true, student: { select: { nationalId: true, firstName: true, lastName: true } } },
    }),
    prisma.guardian.findMany({ where: { nationalId: { in: guardianNationalIds } }, select: { id: true, nationalId: true } }),
    prisma.guardian.findMany({ where: { phone: { in: guardianPhones } }, select: { id: true, phone: true, firstName: true, lastName: true } }),
    prisma.studentEnrollment.findMany({ where: { externalId: { in: externalIds } }, select: { id: true, externalId: true } }),
  ]);

  const groupIds = new Map(groups.map((group) => [`${group.gradeLevel}|${group.name}`, group.id]));
  const studentByTc = new Map(existingStudents.map((student) => [student.nationalId, student]));
  const enrollmentByStudent = new Map(existingEnrollments.map((enrollment) => [enrollment.studentId, enrollment]));
  const enrollmentByNo = new Map(existingEnrollments.map((enrollment) => [enrollment.studentNo, enrollment]));
  const guardianIdByTc = new Map(guardiansByTc.map((guardian) => [guardian.nationalId!, guardian.id]));
  const guardianIdByPhone = new Map(guardiansByPhone.map((g) => [`${g.phone}|${g.firstName}|${g.lastName}`, g.id]));
  const externalOwnerById = new Map(externalOwners.map((e) => [e.externalId!, e.id]));

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const row of rows) {
          const groupKey = `${row.gradeLevel}|${row.className}`;
          let classGroupId = groupIds.get(groupKey);
          if (!classGroupId) {
            const group = await tx.classGroup.create({
              data: { branchId, academicYearId, gradeLevel: row.gradeLevel, name: row.className, field: row.field },
            });
            classGroupId = group.id;
            groupIds.set(groupKey, classGroupId);
            summary.classGroupsCreated++;
          }

          const noOwner = enrollmentByNo.get(row.studentNo);
          if (noOwner && noOwner.student.nationalId !== row.nationalId) {
            dbSkipped.push({
              row: row.row,
              reason: `${row.firstName} ${row.lastName}: ${row.studentNo} numarası sistemde ${fullName(noOwner.student)} adlı öğrencide`,
            });
            continue;
          }

          const existingStudent = studentByTc.get(row.nationalId);
          const optionalStudentData = present({ gender: row.gender, birthDate: row.birthDate, phone: row.phone, email: row.email });
          const studentId = existingStudent
            ? (
                await tx.student.update({
                  where: { id: existingStudent.id },
                  data: { firstName: row.firstName, lastName: row.lastName, isActive: true, ...optionalStudentData },
                  select: { id: true },
                })
              ).id
            : (
                await tx.student.create({
                  data: { nationalId: row.nationalId, firstName: row.firstName, lastName: row.lastName, ...optionalStudentData },
                  select: { id: true },
                })
              ).id;
          if (existingStudent) summary.studentsUpdated++;
          else summary.studentsCreated++;

          const existingEnrollment = enrollmentByStudent.get(studentId);
          const externalOwnerId = row.externalId ? externalOwnerById.get(row.externalId) : undefined;
          const canUseExternalId = row.externalId && (!externalOwnerId || externalOwnerId === existingEnrollment?.id);
          const enrollmentData = {
            classGroupId,
            studentNo: row.studentNo,
            field: row.field,
            status: "ACTIVE" as const,
            ...present({ enrollmentType: row.enrollmentType, enrolledOn: row.enrolledOn }),
            ...(canUseExternalId ? { externalId: row.externalId } : {}),
          };
          if (existingEnrollment) {
            await tx.studentEnrollment.update({ where: { id: existingEnrollment.id }, data: enrollmentData, select: { id: true } });
            summary.enrollmentsUpdated++;
          } else {
            await tx.studentEnrollment.create({ data: { ...enrollmentData, studentId, branchId, academicYearId }, select: { id: true } });
            summary.enrollmentsCreated++;
          }

          const existingLinks = existingStudent?.guardians ?? [];
          for (const parsedGuardian of row.guardians) {
            let guardianId: number | null = null;
            if (parsedGuardian.nationalId) guardianId = guardianIdByTc.get(parsedGuardian.nationalId) ?? null;
            if (!guardianId) {
              const linked = existingLinks.find((link) => link.relation === parsedGuardian.relation);
              if (linked && (!parsedGuardian.nationalId || !linked.guardian.nationalId)) guardianId = linked.guardianId;
            }
            if (!guardianId && parsedGuardian.phone) {
              guardianId = guardianIdByPhone.get(`${parsedGuardian.phone}|${parsedGuardian.firstName}|${parsedGuardian.lastName}`) ?? null;
            }

            const guardianData = {
              firstName: parsedGuardian.firstName,
              lastName: parsedGuardian.lastName,
              ...present({ phone: parsedGuardian.phone, email: parsedGuardian.email, nationalId: parsedGuardian.nationalId }),
            };
            if (guardianId) {
              await tx.guardian.update({ where: { id: guardianId }, data: guardianData, select: { id: true } });
            } else {
              guardianId = (await tx.guardian.create({ data: guardianData, select: { id: true } })).id;
              summary.guardiansCreated++;
              // Aynı dosyadaki kardeşler için haritaları güncelle
              if (parsedGuardian.nationalId) guardianIdByTc.set(parsedGuardian.nationalId, guardianId);
              if (parsedGuardian.phone) {
                guardianIdByPhone.set(`${parsedGuardian.phone}|${parsedGuardian.firstName}|${parsedGuardian.lastName}`, guardianId);
              }
            }

            const linkData = {
              relation: parsedGuardian.relation,
              contactOrder: parsedGuardian.contactOrder,
              receivesSms: parsedGuardian.receivesSms,
            };
            await tx.studentGuardian.upsert({
              where: { studentId_guardianId: { studentId, guardianId } },
              create: { studentId, guardianId, ...linkData },
              update: linkData,
              select: { id: true },
            });
          }
        }

        if (options.deactivateMissing) {
          const result = await tx.studentEnrollment.updateMany({
            where: { branchId, academicYearId, status: "ACTIVE", studentNo: { notIn: [...allFileNos] } },
            data: { status: "CANCELLED" },
          });
          summary.cancelled = result.count;
        }
      },
      { timeout: 600_000, maxWait: 30_000 },
    );
  } catch (error) {
    console.error("Öğrenci aktarımı başarısız", error);
    return { error: "Aktarım sırasında hata oluştu, hiçbir değişiklik kaydedilmedi.", skipped };
  }

  return { summary, skipped: [...skipped, ...dbSkipped].sort((a, b) => a.row - b.row) };
}
