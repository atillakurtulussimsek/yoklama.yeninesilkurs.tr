"use client";

import { useActionState } from "react";
import { saveExam } from "./actions";

export type ExamFormData = { id: number; name: string; date: string; note: string | null; classGroupIds: number[] };

export default function ExamForm({
  exam,
  classGroups,
}: {
  exam?: ExamFormData;
  classGroups: { id: number; label: string }[];
}) {
  const [state, action, pending] = useActionState(saveExam, undefined);
  const selected = new Set(exam?.classGroupIds ?? []);

  return (
    <form action={action} className="space-y-4">
      {exam && <input type="hidden" name="id" value={exam.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <div>
          <label className="label" htmlFor="name">Sınav adı</label>
          <input className="input" id="name" name="name" placeholder="Örn. 1. TYT Deneme" defaultValue={exam?.name} required />
        </div>
        <div>
          <label className="label" htmlFor="date">Tarih</label>
          <input className="input" type="date" id="date" name="date" defaultValue={exam?.date} required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="note">Not</label>
        <input className="input" id="note" name="note" maxLength={255} defaultValue={exam?.note ?? ""} />
      </div>
      <div>
        <div className="label">Uygulanan şubeler (hiçbiri seçilmezse tüm şubeler)</div>
        <div className="flex flex-wrap gap-2">
          {classGroups.map((group) => (
            <label key={group.id} className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1 text-sm">
              <input type="checkbox" name="classGroupIds" value={group.id} defaultChecked={selected.has(group.id)} />
              {group.label}
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Kaydediliyor..." : exam ? "Kaydet" : "Sınavı oluştur"}</button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
      </div>
    </form>
  );
}
