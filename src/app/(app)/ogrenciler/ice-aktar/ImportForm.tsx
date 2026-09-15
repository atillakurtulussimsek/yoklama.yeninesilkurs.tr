"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importStudents } from "../actions";

export default function ImportForm() {
  const [state, action, pending] = useActionState(importStudents, undefined);
  const summary = state?.summary;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input
          type="file"
          name="file"
          accept=".xlsx"
          required
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-700"
        />
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" name="deactivateMissing" className="mt-0.5" />
          <span>
            Dosyada numarası olmayan aktif kayıtları <strong>iptal</strong> et (tam güncel liste yüklüyorsanız işaretleyin)
          </span>
        </label>
        <button className="btn-primary" disabled={pending}>{pending ? "Aktarılıyor..." : "Aktar"}</button>
      </form>

      {state?.error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}

      {summary && (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p>
            Öğrenci: {summary.studentsCreated} yeni, {summary.studentsUpdated} güncellendi · Kayıt:{" "}
            {summary.enrollmentsCreated} yeni, {summary.enrollmentsUpdated} güncellendi
          </p>
          <p>
            {summary.classGroupsCreated} şube oluşturuldu · {summary.guardiansCreated} veli eklendi
            {summary.cancelled ? ` · ${summary.cancelled} kayıt iptal edildi` : ""}
          </p>
          <Link href="/ogrenciler" className="font-medium underline">Listeye git</Link>
        </div>
      )}

      {state?.skipped && state.skipped.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="mb-1 font-medium">Aktarılmayan satırlar ({state.skipped.length})</p>
          <ul className="max-h-60 list-inside list-disc overflow-y-auto">
            {state.skipped.map((item) => (
              <li key={item.row}>{item.row}. satır – {item.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
