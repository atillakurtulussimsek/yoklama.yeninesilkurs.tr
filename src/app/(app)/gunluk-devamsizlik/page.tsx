import Link from "next/link";
import { requireContext } from "@/lib/context";
import { DAILY_KIND_LABELS, DAILY_KINDS } from "@/lib/dailyLabels";
import { dailyFilterQuery, formatGuardianShort, getDailyAbsences, parseDailyFilter } from "@/lib/dailyAbsenceReport";
import { addDays, formatDate, formatDateLong } from "@/lib/dates";
import { formatDays, SESSION_LABELS } from "@/lib/dayAbsence";
import { formatPhone } from "@/lib/phone";
import { getClassGroupOptions } from "@/lib/reports";
import ContactPanel from "@/app/(app)/veli-bilgilendirme/ContactPanel";
import DailyRowEditor from "./DailyRowEditor";
import RecomputeButton from "./RecomputeButton";

export default async function DailyAbsencePage({ searchParams }: PageProps<"/gunluk-devamsizlik">) {
  const { user, branch, academicYear } = await requireContext();
  const filter = parseDailyFilter(await searchParams);
  const [rows, classGroups] = await Promise.all([
    getDailyAbsences(branch.id, academicYear.id, filter),
    getClassGroupOptions(branch.id, academicYear.id),
  ]);

  const totals = { days: 0, FULL_DAY: 0, HALF_DAY: 0, LATE: 0, EXCUSED: 0, uncontacted: 0 };
  for (const row of rows) {
    totals.days += row.days;
    totals[row.kind]++;
    if (row.contacts.length === 0) totals.uncontacted++;
  }
  const query = dailyFilterQuery(filter);
  const dayLink = (date: string) => `/gunluk-devamsizlik?${dailyFilterQuery({ ...filter, date })}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Günlük Devamsızlık Raporu</h1>
          <p className="text-sm text-gray-500">
            {branch.name} · {formatDateLong(filter.date)} · ders devamsızlıklarından türetilir; veli görüşmesi ve açıklama eklenip
            PDF olarak idareye sunulur.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user.role === "ADMIN" && <RecomputeButton date={filter.date} />}
          <a href={`/api/rapor/gunluk-devamsizlik?${query}`} className="btn-primary" target="_blank" rel="noreferrer">
            PDF raporu
          </a>
        </div>
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4">
        <div className="flex items-end gap-1">
          <Link href={dayLink(addDays(filter.date, -1))} className="btn-secondary px-2.5" title="Önceki gün">‹</Link>
          <div>
            <label className="label" htmlFor="tarih">Tarih</label>
            <input className="input" type="date" id="tarih" name="tarih" defaultValue={filter.date} />
          </div>
          <Link href={dayLink(addDays(filter.date, 1))} className="btn-secondary px-2.5" title="Sonraki gün">›</Link>
        </div>
        <div>
          <label className="label" htmlFor="sinif">Sınıf</label>
          <select className="input" id="sinif" name="sinif" defaultValue={filter.classGroupId}>
            <option value={0}>Tüm sınıflar</option>
            {classGroups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tur">Tür</label>
          <select className="input" id="tur" name="tur" defaultValue={filter.kind}>
            <option value="">Tümü</option>
            {DAILY_KINDS.map((kind) => <option key={kind} value={kind}>{DAILY_KIND_LABELS[kind]}</option>)}
          </select>
        </div>
        <button className="btn-secondary">Getir</button>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div className="card p-4">
          <div className="text-xs text-gray-500">Devamsız öğrenci</div>
          <div className="mt-1 text-2xl font-semibold">{rows.length}</div>
          <div className="text-xs text-gray-400">{formatDays(totals.days)} gün</div>
        </div>
        {DAILY_KINDS.map((kind) => (
          <div key={kind} className="card p-4">
            <div className="text-xs text-gray-500">{DAILY_KIND_LABELS[kind]}</div>
            <div className="mt-1 text-2xl font-semibold">{totals[kind]}</div>
          </div>
        ))}
        <div className={`card p-4 ${totals.uncontacted ? "border-orange-200 bg-orange-50" : ""}`}>
          <div className="text-xs text-orange-700">Veliye ulaşılmayan</div>
          <div className="mt-1 text-2xl font-semibold text-orange-800">{totals.uncontacted}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-gray-500">{formatDate(filter.date)} tarihinde günlük devamsızlık yok.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="card grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/ogrenciler/${row.enrollmentId}`} className="font-semibold hover:text-indigo-600">
                      {row.fullName}
                    </Link>
                    <div className="text-xs text-gray-500">No {row.studentNo} · {row.className}</div>
                  </div>
                  <div className="text-right text-xs">
                    {row.guardians.map((guardian) => (
                      <div key={guardian.id}>
                        <span className="text-gray-500">{formatGuardianShort(guardian)}: </span>
                        {guardian.phone ? (
                          <a href={`tel:${guardian.phone}`} className="font-medium text-indigo-600 hover:underline">{formatPhone(guardian.phone)}</a>
                        ) : (
                          <span className="text-red-600">tel yok</span>
                        )}
                      </div>
                    ))}
                    {row.guardians.length === 0 && <span className="text-red-600">Veli kayıtlı değil</span>}
                  </div>
                </div>
                <DailyRowEditor id={row.id} kind={row.kind} note={row.note} manual={row.manual} />
                <div className="text-xs text-gray-600">
                  {row.days ? <span className="font-medium">{formatDays(row.days)} gün{row.session ? ` (${SESSION_LABELS[row.session]})` : ""} · </span> : null}
                  {row.missedLessons}
                  {row.detail && <span className="text-gray-400" title={row.detail}> · ayrıntı</span>}
                </div>
              </div>
              <div className="border-t border-gray-100 pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
                <div className="mb-1 text-xs font-medium text-gray-600">Veli görüşmesi</div>
                <ContactPanel
                  recordIds={row.recordIds}
                  guardians={row.guardians.map((guardian) => ({ id: guardian.id, label: formatGuardianShort(guardian) }))}
                  logs={row.contacts.map((contact) => ({
                    id: contact.id,
                    result: contact.result,
                    note: contact.note,
                    guardianName: contact.guardianName,
                    userName: contact.userName,
                    createdAt: contact.createdAt,
                    canDelete: user.role === "ADMIN" || contact.userId === user.id,
                  }))}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
