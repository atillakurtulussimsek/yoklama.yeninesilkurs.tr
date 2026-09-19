"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import { STATUSES, STATUS_LABELS } from "@/lib/labels";

// Sınavda erken çıkış kullanılmaz
const EXAM_STATUSES = STATUSES.filter((status) => status !== "EARLY_LEAVE");
import { saveExamAttendance } from "../actions";

type Student = { id: number; studentNo: number; fullName: string; className: string };
type Entry = { status: AttendanceStatus | null; note: string };

const ACTIVE_COLORS: Record<AttendanceStatus, string> = {
  ABSENT: "bg-red-600 text-white border-red-600",
  LATE: "bg-amber-500 text-white border-amber-500",
  EARLY_LEAVE: "bg-sky-600 text-white border-sky-600",
  EXCUSED: "bg-violet-600 text-white border-violet-600",
};

export default function ExamAttendanceForm({
  examId,
  students,
  initialRecords,
}: {
  examId: number;
  students: Student[];
  initialRecords: { enrollmentId: number; status: AttendanceStatus; note: string | null }[];
}) {
  const [entries, setEntries] = useState<Record<number, Entry>>(() =>
    Object.fromEntries(initialRecords.map((record) => [record.enrollmentId, { status: record.status, note: record.note ?? "" }])),
  );
  const [search, setSearch] = useState("");
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return students.filter((student) => {
      if (onlyMarked && !entries[student.id]?.status) return false;
      if (!query) return true;
      return (
        student.fullName.toLocaleLowerCase("tr-TR").includes(query) ||
        String(student.studentNo) === query ||
        student.className.toLocaleLowerCase("tr-TR").includes(query)
      );
    });
  }, [students, search, onlyMarked, entries]);

  const markedCount = students.filter((student) => entries[student.id]?.status).length;

  function update(id: number, patch: Partial<Entry>) {
    setDirty(true);
    setMessage(null);
    setEntries((current) => ({ ...current, [id]: { ...(current[id] ?? { status: null, note: "" }), ...patch } }));
  }

  function save() {
    startTransition(async () => {
      const result = await saveExamAttendance({
        examId,
        entries: students.map((student) => ({
          enrollmentId: student.id,
          status: entries[student.id]?.status ?? null,
          note: entries[student.id]?.status ? entries[student.id].note : undefined,
        })),
      });
      if ("error" in result) setMessage({ type: "error", text: result.error! });
      else {
        setDirty(false);
        setMessage({ type: "ok", text: `Sınav yoklaması kaydedildi. ${result.markedCount} öğrenci işaretli.` });
      }
    });
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4">
        <input className="input max-w-xs" placeholder="Ad, numara veya sınıf ara..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={onlyMarked} onChange={(e) => setOnlyMarked(e.target.checked)} />
          Yalnızca işaretliler
        </label>
        <span className="text-sm text-gray-500">
          {students.length} öğrenci · <strong className="text-gray-800">{markedCount}</strong> işaretli
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Ad Soyad</th>
              <th>Sınıf</th>
              <th>Durum</th>
              <th>Açıklama</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((student) => {
              const entry = entries[student.id];
              return (
                <tr key={student.id} className={entry?.status ? "bg-red-50/40" : undefined}>
                  <td className="text-gray-500">{student.studentNo}</td>
                  <td className="font-medium whitespace-nowrap">
                    <Link href={`/ogrenciler/${student.id}`} target="_blank" className="hover:text-indigo-600">{student.fullName}</Link>
                  </td>
                  <td className="whitespace-nowrap">{student.className}</td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => update(student.id, { status: null })}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium ${!entry?.status ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                      >
                        Katıldı
                      </button>
                      {EXAM_STATUSES.map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => update(student.id, { status })}
                          className={`rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${entry?.status === status ? ACTIVE_COLORS[status] : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                        >
                          {status === "ABSENT" ? "Katılmadı" : STATUS_LABELS[status]}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="min-w-56">
                    {entry?.status && (
                      <input className="input py-1" placeholder="Açıklama" value={entry.note} maxLength={255} onChange={(e) => update(student.id, { note: e.target.value })} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 rounded-b-xl border-t border-gray-100 bg-white/95 p-4 backdrop-blur">
        {message && <span className={`text-sm ${message.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>{message.text}</span>}
        {dirty && !message && <span className="text-sm text-amber-700">Kaydedilmemiş değişiklik var</span>}
        <button type="button" className="btn-primary" onClick={save} disabled={pending}>
          {pending ? "Kaydediliyor..." : "Sınav yoklamasını kaydet"}
        </button>
      </div>
    </div>
  );
}
