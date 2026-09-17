"use client";

import { useActionState, useEffect, useRef } from "react";
import { uploadSlips } from "./actions";

export default function UploadForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(uploadSlips, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="card space-y-3 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label className="label" htmlFor="files">Yoklama fişi görselleri (çoklu seçim)</label>
          <input
            id="files"
            name="files"
            type="file"
            accept="image/*"
            multiple
            required
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-indigo-700"
          />
        </div>
        <div>
          <label className="label" htmlFor="tarih">Tarih (fişteki tarih yerine)</label>
          <input className="input" type="date" id="tarih" name="tarih" placeholder={today} />
        </div>
        <button className="btn-primary" disabled={pending}>{pending ? "Yükleniyor..." : "Yükle ve çözümle"}</button>
      </div>
      <p className="text-xs text-gray-500">
        Her fiş yapay zekayla okunur (~10–20 sn), sonuç aşağıda listelenir; kontrol edip onaylarsınız. Tarih boş bırakılırsa fişteki tarih kullanılır.
      </p>
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
