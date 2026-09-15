"use client";

import { useState, useTransition } from "react";
import type { DailyAbsenceKind } from "@/generated/prisma/enums";
import { DAILY_KIND_COLORS, DAILY_KIND_LABELS, DAILY_KINDS } from "@/lib/dailyLabels";
import { resetDailyAbsence, updateDailyAbsence } from "./actions";

export default function DailyRowEditor({
  id,
  kind,
  note,
  manual,
}: {
  id: number;
  kind: DailyAbsenceKind;
  note: string | null;
  manual: boolean;
}) {
  const [value, setValue] = useState(note ?? "");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const dirty = value !== (note ?? "");

  function save(patch: { kind?: DailyAbsenceKind; note?: string }) {
    startTransition(async () => {
      const result = await updateDailyAbsence({ id, ...patch });
      if ("error" in result) setError(result.error!);
      else setError("");
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <select
          className={`badge cursor-pointer appearance-none border-0 ${DAILY_KIND_COLORS[kind]}`}
          value={kind}
          disabled={pending}
          onChange={(event) => save({ kind: event.target.value as DailyAbsenceKind })}
          aria-label="Tür"
        >
          {DAILY_KINDS.map((item) => (
            <option key={item} value={item}>{DAILY_KIND_LABELS[item]}</option>
          ))}
        </select>
        {manual && (
          <button
            type="button"
            className="text-xs text-gray-400 hover:text-indigo-600"
            title="Elle değiştirildi; otomatik hesaba dön"
            disabled={pending}
            onClick={() => startTransition(() => void resetDailyAbsence(id))}
          >
            elle ↺
          </button>
        )}
      </div>
      {editing || value ? (
        <div className="flex gap-1">
          <input
            className="input py-1 text-xs"
            placeholder="Açıklama (idareye sunulacak)"
            value={value}
            maxLength={500}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => dirty && save({ note: value })}
            onKeyDown={(event) => event.key === "Enter" && dirty && save({ note: value })}
          />
          {dirty && (
            <button type="button" className="btn-primary px-2 py-1 text-xs" disabled={pending} onClick={() => save({ note: value })}>
              Kaydet
            </button>
          )}
        </div>
      ) : (
        <button type="button" className="self-start text-xs text-indigo-600 hover:underline" onClick={() => setEditing(true)}>
          + açıklama
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
