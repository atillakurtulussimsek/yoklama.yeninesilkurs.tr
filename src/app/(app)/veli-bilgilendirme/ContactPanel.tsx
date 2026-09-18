"use client";

import { useState, useTransition } from "react";
import type { ContactResult } from "@/generated/prisma/enums";
import { CONTACT_COLORS, CONTACT_LABELS, CONTACT_RESULTS } from "@/lib/labels";
import { addContactLog, deleteContactLog } from "./actions";

type Log = {
  id: number;
  result: ContactResult;
  note: string | null;
  guardianName: string | null;
  userName: string;
  createdAt: string;
  canDelete: boolean;
};

const timeFormat = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });

const chipClass = (active: boolean) =>
  `rounded-md border px-2.5 py-1 text-xs font-medium ${
    active ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
  }`;

export default function ContactPanel({
  recordIds,
  examAttendanceIds,
  guardians,
  logs,
}: {
  recordIds?: number[];
  examAttendanceIds?: number[];
  guardians: { id: number; label: string }[];
  logs: Log[];
}) {
  const [result, setResult] = useState<ContactResult | null>(null);
  const [guardianId, setGuardianId] = useState<number | null>(guardians.length === 1 ? guardians[0].id : null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!result) return;
    startTransition(async () => {
      const response = await addContactLog({ recordIds, examAttendanceIds, guardianId, result, note });
      if ("error" in response) {
        setError(response.error!);
      } else {
        setResult(null);
        setNote("");
        setError("");
      }
    });
  }

  function remove(id: number) {
    if (!confirm("Bu bilgilendirme kaydı silinsin mi?")) return;
    startTransition(async () => {
      const response = await deleteContactLog(id);
      if ("error" in response) setError(response.error!);
    });
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      {logs.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {logs.map((log) => (
            <li key={log.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`badge ${CONTACT_COLORS[log.result]}`}>{CONTACT_LABELS[log.result]}</span>
              {log.guardianName && <span className="text-xs text-gray-500">{log.guardianName}</span>}
              {log.note && <span className="text-gray-700">{log.note}</span>}
              <span className="text-xs text-gray-400">
                {log.userName} · {timeFormat.format(new Date(log.createdAt))}
              </span>
              {log.canDelete && (
                <button
                  type="button"
                  onClick={() => remove(log.id)}
                  className="text-xs text-gray-400 hover:text-red-600"
                  disabled={pending}
                >
                  sil
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5">
        {CONTACT_RESULTS.map((item) => (
          <button key={item} type="button" onClick={() => setResult(item === result ? null : item)} className={chipClass(result === item)}>
            {CONTACT_LABELS[item]}
          </button>
        ))}
      </div>
      {result && (
        <div className="mt-2 space-y-2">
          {guardians.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-gray-500">Görüşülen:</span>
              {guardians.map((guardian) => (
                <button
                  key={guardian.id}
                  type="button"
                  onClick={() => setGuardianId(guardian.id === guardianId ? null : guardian.id)}
                  className={chipClass(guardian.id === guardianId)}
                >
                  {guardian.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              className="input py-1.5"
              placeholder="Açıklama (örn. hasta, şehir dışında)"
              value={note}
              maxLength={255}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submit()}
            />
            <button type="button" className="btn-primary py-1.5" onClick={submit} disabled={pending}>
              Kaydet
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
