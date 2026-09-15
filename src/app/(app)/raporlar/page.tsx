import Link from "next/link";
import { requireContext } from "@/lib/context";
import { formatDate } from "@/lib/dates";
import { STATUSES, STATUS_COLORS, STATUS_LABELS } from "@/lib/labels";
import { formatDays } from "@/lib/dayAbsence";
import { filterQuery, getClassGroupOptions, getReport, getTermOptions, parseReportFilter } from "@/lib/reports";

const OTHER_STATUSES = STATUSES.filter((status) => status !== "ABSENT");

export default async function ReportsPage({ searchParams }: PageProps<"/raporlar">) {
  const { branch, academicYear } = await requireContext();
  const terms = await getTermOptions(academicYear.id);
  const filter = parseReportFilter(await searchParams, terms);
  const selectedTerm = terms.find((term) => term.id === filter.termId);
  const [report, classGroups] = await Promise.all([
    getReport(branch.id, academicYear.id, filter),
    getClassGroupOptions(branch.id, academicYear.id),
  ]);
  const selectedClass = classGroups.find((group) => group.id === filter.classGroupId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Raporlar</h1>
          <p className="text-sm text-gray-500">
            {branch.name} · {selectedTerm ? `${selectedTerm.name} · ` : ""}{formatDate(filter.from)} – {formatDate(filter.to)} ·{" "}
            {selectedClass ? selectedClass.label : "Tüm sınıflar"}
          </p>
        </div>
        <a href={`/api/rapor?${filterQuery(filter)}`} className="btn-secondary">Excel indir</a>
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4">
        {terms.length > 0 && (
          <div>
            <label className="label" htmlFor="donem">Dönem</label>
            <select className="input" id="donem" name="donem" defaultValue={filter.termId}>
              <option value={0}>Tarih aralığı seç</option>
              {terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="baslangic">Başlangıç</label>
          <input className="input" type="date" id="baslangic" name="baslangic" defaultValue={filter.from} />
        </div>
        <div>
          <label className="label" htmlFor="bitis">Bitiş</label>
          <input className="input" type="date" id="bitis" name="bitis" defaultValue={filter.to} />
        </div>
        <div>
          <label className="label" htmlFor="sinif">Sınıf</label>
          <select className="input" id="sinif" name="sinif" defaultValue={filter.classGroupId}>
            <option value={0}>Tüm sınıflar</option>
            {classGroups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
          </select>
        </div>
        <button className="btn-primary">Raporla</button>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div className="card p-4">
          <div className="text-xs text-gray-500">Devamsızlık yapan öğrenci</div>
          <div className="mt-1 text-2xl font-semibold">{report.totals.studentCount}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500">Toplam devamsız gün</div>
          <div className="mt-1 text-2xl font-semibold">{formatDays(report.totals.absentStudentDays)}</div>
          <div className="text-xs text-gray-400">{report.totals.fullDays} tam · {report.totals.halfDays} yarım</div>
        </div>
        {OTHER_STATUSES.map((status) => (
          <div key={status} className="card p-4">
            <div className="text-xs text-gray-500">{STATUS_LABELS[status]} (kayıt)</div>
            <div className="mt-1 text-2xl font-semibold">{report.totals.counts[status]}</div>
          </div>
        ))}
        <div className="card p-4">
          <div className="text-xs text-gray-500">Veliye ulaşılmayan kayıt</div>
          <div className="mt-1 text-2xl font-semibold text-orange-700">{report.totals.uncontacted}</div>
        </div>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="px-5 pt-4 pb-2 font-semibold">Sınıf bazında</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Sınıf</th>
              <th>Öğrenci</th>
              <th>Yoklama alınan gün</th>
              <th>Devamsız gün</th>
              <th>Öğrenci başına</th>
              {OTHER_STATUSES.map((status) => <th key={status}>{STATUS_LABELS[status]}</th>)}
            </tr>
          </thead>
          <tbody>
            {report.classRows.map((row) => (
              <tr key={row.classGroupId}>
                <td className="font-medium whitespace-nowrap">
                  {row.classGroupId ? (
                    <Link href={`/raporlar?${filterQuery({ ...filter, classGroupId: row.classGroupId })}`} className="hover:text-indigo-600">
                      {row.className}
                    </Link>
                  ) : (
                    row.className
                  )}
                </td>
                <td>{row.studentCount}</td>
                <td>{row.takenDays.size}</td>
                <td>{formatDays(row.absentStudentDays)}</td>
                <td>{row.studentCount ? (row.absentStudentDays / row.studentCount).toFixed(1) : "-"}</td>
                {OTHER_STATUSES.map((status) => <td key={status}>{row.counts[status]}</td>)}
              </tr>
            ))}
            {report.classRows.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-gray-500">Kayıt yok.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <section className="card h-fit overflow-x-auto">
          <h2 className="px-5 pt-4 pb-2 font-semibold">Öğrenci bazında</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Ad Soyad</th>
                <th>Sınıf</th>
                <th>Devamsız gün</th>
                <th>Tam / Yarım</th>
                <th>Geç</th>
                <th>Erken çıkış</th>
                <th>Mazeretli</th>
                <th>Ulaşılmayan</th>
              </tr>
            </thead>
            <tbody>
              {report.studentRows.map((row) => (
                <tr key={row.id}>
                  <td className="text-gray-500">{row.studentNo}</td>
                  <td>
                    <Link href={`/ogrenciler/${row.id}`} className="font-medium whitespace-nowrap hover:text-indigo-600">
                      {row.fullName}
                    </Link>
                    {!row.active && <span className="badge ml-2 bg-gray-100 text-gray-500 ring-gray-200">İptal</span>}
                  </td>
                  <td className="whitespace-nowrap">{row.className}</td>
                  <td>
                    {row.absentDays > 0 ? (
                      <span className={`badge ${STATUS_COLORS.ABSENT}`}>{formatDays(row.absentDays)}</span>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="text-gray-500">{row.fullDays} / {row.halfDays}</td>
                  <td title="Geç işaretli dersler + oturumda tek ders kaçırma">{row.lateEquivalent}</td>
                  <td>{row.counts.EARLY_LEAVE}</td>
                  <td>{row.counts.EXCUSED}</td>
                  <td className={row.uncontacted ? "text-orange-700" : "text-gray-400"}>{row.uncontacted}</td>
                </tr>
              ))}
              {report.studentRows.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-gray-500">Kayıt yok.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="card h-fit overflow-x-auto">
          <h2 className="px-5 pt-4 pb-2 font-semibold">Gün bazında öğrenci sayıları</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Devamsız</th>
                <th>Tam gün</th>
                <th>Yarım gün</th>
                <th>Geç</th>
                <th>Mazeretli</th>
              </tr>
            </thead>
            <tbody>
              {report.dayRows.map((row) => (
                <tr key={row.date}>
                  <td className="whitespace-nowrap">
                    <Link href={`/gunluk-devamsizlik?tarih=${row.date}`} className="hover:text-indigo-600">
                      {formatDate(row.date)}
                    </Link>
                  </td>
                  <td>{row.students.size}</td>
                  <td>{row.fullDays || ""}</td>
                  <td>{row.halfDays || ""}</td>
                  <td>{row.late || ""}</td>
                  <td>{row.excused || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
