import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/context";
import { classLabel, compareClassGroups, fullName } from "@/lib/classGroups";
import { formatPhone, sortGuardianLinks } from "@/lib/phone";
import { RELATION_LABELS } from "@/lib/labels";
import { getClassGroupOptions } from "@/lib/reports";
import type { Prisma } from "@/generated/prisma/client";

export default async function StudentsPage({ searchParams }: PageProps<"/ogrenciler">) {
  const { branch, academicYear } = await requireContext();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const classGroupId = Number(params.sinif) || 0;
  const showCancelled = params.durum === "iptal";
  const scope = { branchId: branch.id, academicYearId: academicYear.id };

  let searchWhere: Prisma.StudentEnrollmentWhereInput = {};
  if (/^\d+$/.test(query)) {
    searchWhere = {
      OR: [
        { studentNo: Number(query) },
        { student: { nationalId: { startsWith: query } } },
        ...(query.length >= 4 ? [{ student: { guardians: { some: { guardian: { phone: { contains: query } } } } } }] : []),
      ],
    };
  } else if (query) {
    searchWhere = {
      AND: query.split(/\s+/).map((word) => ({
        OR: [{ student: { firstName: { contains: word } } }, { student: { lastName: { contains: word } } }],
      })),
    };
  }

  const [enrollments, classGroups, activeCount] = await Promise.all([
    prisma.studentEnrollment.findMany({
      where: {
        ...scope,
        status: showCancelled ? "CANCELLED" : "ACTIVE",
        ...(classGroupId ? { classGroupId } : {}),
        ...searchWhere,
      },
      include: {
        classGroup: { select: { gradeLevel: true, name: true } },
        student: { include: { guardians: { include: { guardian: true } } } },
        _count: { select: { attendanceRecords: { where: { status: "ABSENT" } } } },
      },
    }),
    getClassGroupOptions(branch.id, academicYear.id),
    prisma.studentEnrollment.count({ where: { ...scope, status: "ACTIVE" } }),
  ]);
  enrollments.sort(
    (a, b) =>
      compareClassGroups(a.classGroup, b.classGroup) || fullName(a.student).localeCompare(fullName(b.student), "tr-TR"),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Öğrenciler</h1>
          <p className="text-sm text-gray-500">
            {branch.name} · {academicYear.name} · {activeCount} aktif öğrenci · {classGroups.length} sınıf
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/ogrenciler/ice-aktar" className="btn-secondary">Excel&apos;den aktar</Link>
          <Link href="/ogrenciler/yeni" className="btn-primary">Yeni öğrenci</Link>
        </div>
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="q">Ara</label>
          <input className="input" id="q" name="q" defaultValue={query} placeholder="Ad soyad, numara, TC veya veli telefonu" />
        </div>
        <div>
          <label className="label" htmlFor="sinif">Sınıf</label>
          <select className="input" id="sinif" name="sinif" defaultValue={classGroupId}>
            <option value={0}>Tümü</option>
            {classGroups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="durum">Durum</label>
          <select className="input" id="durum" name="durum" defaultValue={showCancelled ? "iptal" : "aktif"}>
            <option value="aktif">Aktif</option>
            <option value="iptal">Kayıt iptali</option>
          </select>
        </div>
        <button className="btn-secondary">Filtrele</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Ad Soyad</th>
              <th>Sınıf</th>
              <th>Alan</th>
              <th>Veliler</th>
              <th>Toplam gelmedi</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.map((enrollment) => {
              const guardians = sortGuardianLinks(enrollment.student.guardians);
              return (
                <tr key={enrollment.id} className="hover:bg-gray-50">
                  <td className="text-gray-500">{enrollment.studentNo}</td>
                  <td>
                    <Link href={`/ogrenciler/${enrollment.id}`} className="font-medium whitespace-nowrap hover:text-indigo-600">
                      {fullName(enrollment.student)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">{classLabel(enrollment.classGroup)}</td>
                  <td>{enrollment.field}</td>
                  <td className="text-xs">
                    {guardians.map((link) => (
                      <div key={link.id} className="whitespace-nowrap">
                        <span className="text-gray-500">{RELATION_LABELS[link.relation]}: </span>
                        {link.guardian.phone ? (
                          <a href={`tel:${link.guardian.phone}`} className="text-indigo-600 hover:underline">
                            {formatPhone(link.guardian.phone)}
                          </a>
                        ) : (
                          <span className="text-red-600">tel yok</span>
                        )}
                      </div>
                    ))}
                    {guardians.length === 0 && <span className="text-red-600">Veli yok</span>}
                  </td>
                  <td>{enrollment._count.attendanceRecords}</td>
                </tr>
              );
            })}
            {enrollments.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500">Öğrenci bulunamadı.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
