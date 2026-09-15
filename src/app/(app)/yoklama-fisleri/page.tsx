import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/context";
import { fullName } from "@/lib/classGroups";
import { formatDate, formatDateTime } from "@/lib/dates";
import { STATUS_LABELS } from "@/lib/labels";
import type { MatchResult } from "@/lib/slipMatching";
import type { SlipStatus } from "@/generated/prisma/enums";

const STATUS_BADGES: Record<SlipStatus, { label: string; className: string }> = {
  PENDING: { label: "Onay bekliyor", className: "bg-amber-100 text-amber-800 ring-amber-200" },
  APPLIED: { label: "Kaydedildi", className: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  CANCELLED: { label: "İptal", className: "bg-gray-100 text-gray-600 ring-gray-200" },
  FAILED: { label: "Hata", className: "bg-red-100 text-red-800 ring-red-200" },
};

export default async function SlipsPage() {
  const { branch } = await requireContext();
  const slips = await prisma.attendanceSlip.findMany({
    where: { branchId: branch.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { fullName: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Telegram Fişleri</h1>
        <p className="text-sm text-gray-500">{branch.name} · Telegram botuna gönderilen yoklama fişleri (son 100)</p>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Gönderim</th>
              <th>Gönderen</th>
              <th>Durum</th>
              <th>Süre</th>
              <th>Sınıf · Tarih</th>
              <th>Çözümleme</th>
            </tr>
          </thead>
          <tbody>
            {slips.map((slip) => {
              // Eski biçimde kaydedilmiş fişlerde "lessons" olmayabilir
              const raw = slip.matched as Partial<MatchResult> | null;
              const matched = raw && Array.isArray(raw.lessons) ? (raw as MatchResult) : null;
              const badge = STATUS_BADGES[slip.status];
              return (
                <tr key={slip.id}>
                  <td className="whitespace-nowrap text-gray-500">{formatDateTime(slip.createdAt)}</td>
                  <td className="whitespace-nowrap">
                    {slip.user?.fullName ?? (slip.teacher ? fullName(slip.teacher) : "-")}
                    {slip.teacher && <span className="ml-1 text-xs text-gray-400">öğretmen</span>}
                  </td>
                  <td>
                    <span className={`badge ${badge.className}`}>{badge.label}</span>
                    {slip.errorMessage && <div className="mt-1 max-w-xs text-xs text-red-600">{slip.errorMessage}</div>}
                  </td>
                  <td className="whitespace-nowrap text-xs text-gray-500">
                    {slip.analysisMs ? `AI ${Math.round(slip.analysisMs / 1000)} sn` : "-"}
                    {slip.totalMs ? <div>toplam {Math.round(slip.totalMs / 1000)} sn</div> : null}
                  </td>
                  <td className="whitespace-nowrap">
                    {matched ? `${matched.className ?? "?"} · ${formatDate(matched.date)}` : raw?.date ? `${raw.className ?? "?"} · ${formatDate(raw.date)} (eski biçim)` : "-"}
                  </td>
                  <td className="text-xs">
                    {matched?.lessons.map((lesson) => (
                      <div key={lesson.lessonNo} className="mb-1">
                        <span className="font-medium">{lesson.lessonNo}. ders{lesson.subject ? ` (${lesson.subject})` : ""}:</span>{" "}
                        {lesson.absences.length === 0
                          ? <span className="text-gray-400">tam</span>
                          : lesson.absences.map((absence, index) => (
                              <span key={index} className={absence.enrollmentId ? "" : "text-red-600"}>
                                {index > 0 && ", "}
                                {absence.enrollmentId ? `${absence.fullName} (${absence.studentNo})` : `"${absence.raw}" eşleşmedi`} – {STATUS_LABELS[absence.status]}
                              </span>
                            ))}
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
            {slips.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-gray-500">Henüz fiş gönderilmemiş.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
