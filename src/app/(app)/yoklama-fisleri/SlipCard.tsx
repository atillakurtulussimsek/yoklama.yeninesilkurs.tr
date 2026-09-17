"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { SlipStatus } from "@/generated/prisma/enums";
import { STATUS_LABELS } from "@/lib/labels";
import type { MatchResult } from "@/lib/slipMatching";
import { approveSlip, deleteSlip, reanalyzeSlip, rejectSlip } from "./actions";

export type SlipView = {
  id: number;
  status: SlipStatus;
  source: "TELEGRAM" | "WEB";
  fileName: string | null;
  createdAt: string;
  submitter: string;
  analysisMs: number | null;
  errorMessage: string | null;
  matched: MatchResult | null;
  parsedClassName: string | null;
  hasImage: boolean;
};

const STATUS_BADGES: Record<SlipStatus, { label: string; className: string }> = {
  ANALYZING: { label: "Çözümleniyor…", className: "bg-sky-100 text-sky-800 ring-sky-200" },
  PENDING: { label: "Onay bekliyor", className: "bg-amber-100 text-amber-800 ring-amber-200" },
  APPLIED: { label: "Kaydedildi", className: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  CANCELLED: { label: "Reddedildi", className: "bg-gray-100 text-gray-600 ring-gray-200" },
  FAILED: { label: "Hata", className: "bg-red-100 text-red-800 ring-red-200" },
};

function formatDateTr(value: string) {
  const [y, m, d] = value.split("-");
  return `${d}.${m}.${y}`;
}

export default function SlipCard({
  slip,
  classGroups,
  isAdmin,
}: {
  slip: SlipView;
  classGroups: { id: number; label: string }[];
  isAdmin: boolean;
}) {
  const matched = slip.matched;
  const [classGroupId, setClassGroupId] = useState(matched?.classGroupId ?? 0);
  const [date, setDate] = useState(matched?.date ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [zoom, setZoom] = useState(false);
  const [pending, startTransition] = useTransition();
  const badge = STATUS_BADGES[slip.status];
  const unmatched = matched?.lessons.flatMap((l) => l.absences.filter((a) => !a.enrollmentId)) ?? [];
  const lowScore = matched?.lessons.flatMap((l) => l.absences.filter((a) => a.enrollmentId && a.score < 0.8)) ?? [];

  function run(task: () => Promise<{ error?: string; ok?: boolean; markedTotal?: number }>) {
    startTransition(async () => {
      const result = await task();
      if (result.error) setMessage({ ok: false, text: result.error });
      else if (result.markedTotal !== undefined) setMessage({ ok: true, text: `Kaydedildi: ${result.markedTotal} devamsızlık işlendi` });
      else setMessage(null);
    });
  }

  return (
    <div className={`card grid gap-4 p-4 md:grid-cols-[220px_1fr] ${slip.status === "CANCELLED" ? "opacity-70" : ""}`}>
      <div>
        {slip.hasImage ? (
          <button type="button" onClick={() => setZoom(true)} className="block w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/fisler/${slip.id}/gorsel`} alt={slip.fileName ?? `Fiş #${slip.id}`} className="h-56 w-full object-contain" loading="lazy" />
          </button>
        ) : (
          <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs text-gray-400">Görsel yok</div>
        )}
        <div className="mt-2 text-xs text-gray-500">
          #{slip.id} · {slip.source === "WEB" ? "Web" : "Telegram"} · {slip.submitter}
          <div>{slip.createdAt}{slip.analysisMs ? ` · AI ${Math.round(slip.analysisMs / 1000)} sn` : ""}</div>
          {slip.fileName && <div className="truncate" title={slip.fileName}>{slip.fileName}</div>}
        </div>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${badge.className}`}>{badge.label}</span>
          {slip.errorMessage && <span className="text-xs text-red-600">{slip.errorMessage}</span>}
        </div>

        {matched && (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label">Sınıf</label>
                {slip.status === "PENDING" ? (
                  <select className={`input ${!matched.classGroupId ? "border-red-400" : ""}`} value={classGroupId} onChange={(e) => setClassGroupId(Number(e.target.value))}>
                    <option value={0}>Seçin{slip.parsedClassName ? ` (fişte: ${slip.parsedClassName})` : ""}</option>
                    {classGroups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
                  </select>
                ) : (
                  <div className="text-sm font-medium">{matched.className ?? "-"}</div>
                )}
              </div>
              <div>
                <label className="label">Tarih</label>
                {slip.status === "PENDING" ? (
                  <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                ) : (
                  <div className="text-sm font-medium">{formatDateTr(matched.date)}</div>
                )}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {matched.lessons.map((lesson) => (
                <div key={lesson.lessonNo} className="rounded-lg border border-gray-200 p-2 text-xs">
                  <div className="font-medium">
                    {lesson.lessonNo}. Ders{lesson.subject ? ` – ${lesson.subject}` : ""}
                  </div>
                  {lesson.absences.length === 0 ? (
                    <div className="text-emerald-700">Tam</div>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {lesson.absences.map((absence, index) => (
                        <li key={index} className={absence.enrollmentId ? (absence.score < 0.8 ? "text-amber-700" : "") : "text-red-600"}>
                          {absence.enrollmentId ? `${absence.fullName} (${absence.studentNo})` : `"${absence.raw}" eşleşmedi`} – {STATUS_LABELS[absence.status]}
                          {absence.note ? `, ${absence.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {matched.lessons.length === 0 && <div className="text-xs text-red-600">Fişte işlenmiş ders bulunamadı.</div>}
            </div>

            {(unmatched.length > 0 || lowScore.length > 0) && slip.status === "PENDING" && (
              <p className="text-xs text-amber-700">
                {unmatched.length > 0 && `${unmatched.length} numara eşleşmedi (atlanacak). `}
                {lowScore.length > 0 && `${lowScore.length} eşleşme şüpheli, kontrol edin.`}
              </p>
            )}
          </>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {slip.status === "PENDING" && (
            <>
              <button
                type="button"
                className="btn-primary"
                disabled={pending || !classGroupId || !matched || matched.lessons.length === 0}
                onClick={() => run(() => approveSlip({ id: slip.id, classGroupId, date: date || undefined }))}
              >
                ✓ Onayla ve kaydet
              </button>
              <button type="button" className="btn-danger" disabled={pending} onClick={() => run(() => rejectSlip(slip.id))}>
                ✕ Reddet
              </button>
            </>
          )}
          {slip.source === "WEB" && (slip.status === "FAILED" || slip.status === "CANCELLED" || slip.status === "PENDING") && (
            <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(() => reanalyzeSlip(slip.id))}>
              ↻ Yeniden çözümle
            </button>
          )}
          {slip.status === "APPLIED" && matched && (
            <Link href={`/gunluk-devamsizlik?tarih=${matched.date}`} className="btn-secondary">Günlük devamsızlığı aç</Link>
          )}
          {isAdmin && slip.status !== "APPLIED" && slip.status !== "ANALYZING" && (
            <button
              type="button"
              className="text-xs text-gray-400 hover:text-red-600"
              disabled={pending}
              onClick={() => confirm("Fiş silinsin mi?") && run(() => deleteSlip(slip.id))}
            >
              sil
            </button>
          )}
          {message && <span className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</span>}
        </div>
      </div>

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setZoom(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/fisler/${slip.id}/gorsel`} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
