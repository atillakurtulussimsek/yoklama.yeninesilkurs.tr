"use client";

import { useActionState, useTransition } from "react";
import { deleteTerm, saveTerm } from "../actions";

type Term = { id: number; name: string; startsOn: string; endsOn: string };

export default function TermRow({ academicYearId, term }: { academicYearId: number; term?: Term }) {
  const [state, action, pending] = useActionState(saveTerm, undefined);
  const [removing, startTransition] = useTransition();
  const prefix = term ? `t${term.id}` : `tnew${academicYearId}`;

  return (
    <form
      action={action}
      className={`grid gap-2 rounded-lg p-2 sm:grid-cols-[1fr_150px_150px_auto] sm:items-end ${
        term ? "" : "border border-dashed border-gray-300 bg-white"
      }`}
    >
      <input type="hidden" name="academicYearId" value={academicYearId} />
      {term && <input type="hidden" name="id" value={term.id} />}
      <div>
        <label className="label" htmlFor={`${prefix}-name`}>Dönem</label>
        <input className="input" id={`${prefix}-name`} name="name" placeholder="Yaz Programı, Kış Programı..." defaultValue={term?.name} required />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-start`}>Başlangıç</label>
        <input className="input" id={`${prefix}-start`} name="startsOn" type="date" defaultValue={term?.startsOn} required />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-end`}>Bitiş (isteğe bağlı)</label>
        <input className="input" id={`${prefix}-end`} name="endsOn" type="date" defaultValue={term?.endsOn} />
      </div>
      <div className="flex items-center gap-2 pb-0.5">
        <button className={term ? "btn-secondary" : "btn-primary"} disabled={pending}>
          {term ? "Kaydet" : "Ekle"}
        </button>
        {term && (
          <button
            type="button"
            className="btn-danger"
            disabled={removing}
            onClick={() => confirm(`"${term.name}" dönemi silinsin mi?`) && startTransition(() => void deleteTerm(term.id))}
          >
            Sil
          </button>
        )}
      </div>
      {(state?.error || state?.ok) && (
        <p className={`col-span-full text-xs ${state.error ? "text-red-600" : "text-emerald-700"}`}>{state.error ?? state.ok}</p>
      )}
    </form>
  );
}
