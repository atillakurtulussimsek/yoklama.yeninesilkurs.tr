"use client";

import { useActionState } from "react";
import { saveAcademicYear } from "../actions";

type Year = { id: number; name: string; startsOn: string; endsOn: string; isCurrent: boolean };

export default function YearRow({ year }: { year?: Year }) {
  const [state, action, pending] = useActionState(saveAcademicYear, undefined);
  const prefix = year ? `y${year.id}` : "ynew";

  return (
    <form
      action={action}
      className={`grid gap-2 rounded-lg p-2 sm:grid-cols-[130px_160px_160px_auto] sm:items-end ${
        year ? "" : "border border-dashed border-gray-300 bg-gray-50"
      }`}
    >
      {year && <input type="hidden" name="id" value={year.id} />}
      <div>
        <label className="label" htmlFor={`${prefix}-name`}>Yıl</label>
        <input className="input" id={`${prefix}-name`} name="name" placeholder="2026-2027" defaultValue={year?.name} required />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-start`}>Başlangıç</label>
        <input className="input" id={`${prefix}-start`} name="startsOn" type="date" defaultValue={year?.startsOn} required />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-end`}>Bitiş (isteğe bağlı)</label>
        <input className="input" id={`${prefix}-end`} name="endsOn" type="date" defaultValue={year?.endsOn} />
      </div>
      <div className="flex items-center gap-3 pb-1">
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" name="isCurrent" defaultChecked={year?.isCurrent ?? false} />
          Güncel yıl
        </label>
        <button className={year ? "btn-secondary" : "btn-primary"} disabled={pending}>
          {year ? "Kaydet" : "Ekle"}
        </button>
      </div>
      {(state?.error || state?.ok) && (
        <p className={`col-span-full text-xs ${state.error ? "text-red-600" : "text-emerald-700"}`}>{state.error ?? state.ok}</p>
      )}
    </form>
  );
}
