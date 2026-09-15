"use client";

import { useActionState } from "react";
import { saveBranch } from "../actions";

type Branch = { id: number; name: string; address: string | null; phone: string | null; isActive: boolean };

export default function BranchRow({ branch }: { branch?: Branch }) {
  const [state, action, pending] = useActionState(saveBranch, undefined);

  return (
    <form
      action={action}
      className={`grid gap-2 rounded-lg p-2 sm:grid-cols-[1fr_1fr_150px_auto] sm:items-center ${
        branch ? (branch.isActive ? "" : "opacity-60") : "border border-dashed border-gray-300 bg-gray-50"
      }`}
    >
      {branch && <input type="hidden" name="id" value={branch.id} />}
      <input className="input" name="name" placeholder="Kurum adı (örn. Ortaca Yeni Nesil Kurs Merkezi)" defaultValue={branch?.name} required aria-label="Kurum adı" />
      <input className="input" name="address" placeholder="Adres" defaultValue={branch?.address ?? ""} aria-label="Adres" />
      <input className="input" name="phone" placeholder="Telefon" defaultValue={branch?.phone ?? ""} aria-label="Telefon" />
      <div className="flex items-center gap-3">
        {branch && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" name="isActive" defaultChecked={branch.isActive} />
            Aktif
          </label>
        )}
        <button className={branch ? "btn-secondary" : "btn-primary"} disabled={pending}>
          {branch ? "Kaydet" : "Ekle"}
        </button>
      </div>
      {(state?.error || state?.ok) && (
        <p className={`col-span-full text-xs ${state.error ? "text-red-600" : "text-emerald-700"}`}>{state.error ?? state.ok}</p>
      )}
    </form>
  );
}
