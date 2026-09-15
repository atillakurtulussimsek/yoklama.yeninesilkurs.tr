import Link from "next/link";
import { requireContext } from "@/lib/context";
import { findChronicStudents } from "@/lib/chronic";
import { formatDate, isDateStr, todayStr } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { STATUS_COLORS } from "@/lib/labels";
import { formatDays } from "@/lib/dayAbsence";

export default async function ChronicPage({ searchParams }: PageProps<"/raporlar/surekli-devamsiz">) {
  const { user, branch, academicYear } = await requireContext();
  const params = await searchParams;
  const endDate = isDateStr(params.tarih) ? params.tarih : todayStr();
  const { settings, startDate, students } = await findChronicStudents(branch.id, academicYear.id, endDate);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Sürekli Devamsızlar</h1>
          <p className="text-sm text-gray-500">
            {formatDate(startDate)} – {formatDate(endDate)} · {settings.absenceThreshold}+ devamsız gün veya{" "}
            {settings.consecutiveThreshold}+ gün üst üste
            {user.role === "ADMIN" && (
              <>
                {" "}· <Link href="/ayarlar" className="text-indigo-600 hover:underline">kriterleri değiştir</Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <form className="flex items-end gap-2">
            <div>
              <label className="label" htmlFor="tarih">Bitiş tarihi</label>
              <input className="input" type="date" id="tarih" name="tarih" defaultValue={endDate} />
            </div>
            <button className="btn-secondary">Getir</button>
          </form>
          <a href={`/api/rapor/surekli-devamsiz?tarih=${endDate}`} className="btn-secondary">Excel indir</a>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Ad Soyad</th>
              <th>Sınıf</th>
              <th>Veli telefonu</th>
              <th>Devamsız gün</th>
              <th>En uzun üst üste</th>
              <th>Hâlâ devam eden</th>
              <th>Geç</th>
              <th>Son devamsızlık</th>
              <th>Neden</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id}>
                <td className="text-gray-500">{student.studentNo}</td>
                <td>
                  <Link href={`/ogrenciler/${student.id}`} className="font-medium whitespace-nowrap hover:text-indigo-600">
                    {student.fullName}
                  </Link>
                </td>
                <td className="whitespace-nowrap">{student.className}</td>
                <td className="whitespace-nowrap">
                  {student.parentPhone ? (
                    <a href={`tel:${student.parentPhone}`} className="text-indigo-600 hover:underline">
                      {formatPhone(student.parentPhone)}
                    </a>
                  ) : (
                    <span className="text-xs text-red-600">Yok</span>
                  )}
                </td>
                <td><span className={`badge ${STATUS_COLORS.ABSENT}`}>{formatDays(student.absentDays)}</span></td>
                <td>{student.maxConsecutive}</td>
                <td className={student.currentConsecutive > 0 ? "font-semibold text-red-700" : "text-gray-400"}>
                  {student.currentConsecutive}
                </td>
                <td>{student.lateCount}</td>
                <td className="whitespace-nowrap">{formatDate(student.lastAbsentDate)}</td>
                <td className="text-xs text-gray-600">{student.reasons.join(" · ")}</td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr><td colSpan={10} className="py-8 text-center text-gray-500">Kritere uyan öğrenci yok.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
