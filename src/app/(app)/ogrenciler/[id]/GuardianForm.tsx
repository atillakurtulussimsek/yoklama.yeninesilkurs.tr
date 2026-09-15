"use client";

import { useActionState, useTransition } from "react";
import type { GuardianRelation } from "@/generated/prisma/enums";
import { RELATION_LABELS } from "@/lib/labels";
import { removeGuardian, saveGuardian } from "../actions";

type Link = {
  guardianId: number;
  relation: GuardianRelation;
  contactOrder: number | null;
  receivesSms: boolean;
  guardian: { firstName: string; lastName: string; phone: string | null; nationalId: string | null };
};

export default function GuardianForm({ studentId, link }: { studentId: number; link?: Link }) {
  const [state, action, pending] = useActionState(saveGuardian, undefined);
  const [removing, startTransition] = useTransition();
  const prefix = link ? `g${link.guardianId}` : "gnew";

  return (
    <form action={action} className={`grid grid-cols-2 gap-3 ${link ? "border-b border-gray-100 pb-4" : ""}`}>
      <input type="hidden" name="studentId" value={studentId} />
      {link && <input type="hidden" name="guardianId" value={link.guardianId} />}
      <div>
        <label className="label" htmlFor={`${prefix}-relation`}>Yakınlık</label>
        <select className="input" id={`${prefix}-relation`} name="relation" defaultValue={link?.relation ?? "MOTHER"}>
          {(Object.keys(RELATION_LABELS) as GuardianRelation[]).map((relation) => (
            <option key={relation} value={relation}>{RELATION_LABELS[relation]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-order`}>Ulaşım sırası</label>
        <input className="input" id={`${prefix}-order`} name="contactOrder" type="number" min={1} max={9} defaultValue={link?.contactOrder ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-first`}>Ad</label>
        <input className="input" id={`${prefix}-first`} name="firstName" defaultValue={link?.guardian.firstName} required />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-last`}>Soyad</label>
        <input className="input" id={`${prefix}-last`} name="lastName" defaultValue={link?.guardian.lastName} required />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-phone`}>Telefon</label>
        <input className="input" id={`${prefix}-phone`} name="phone" type="tel" defaultValue={link?.guardian.phone ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-tc`}>TC kimlik no</label>
        <input className="input" id={`${prefix}-tc`} name="nationalId" inputMode="numeric" maxLength={11} defaultValue={link?.guardian.nationalId ?? ""} />
      </div>
      <label className="col-span-2 flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" name="receivesSms" defaultChecked={link?.receivesSms ?? true} />
        SMS alsın
      </label>
      <div className="col-span-2 flex flex-wrap items-center gap-2">
        <button className="btn-secondary py-1.5" disabled={pending}>{link ? "Kaydet" : "Ekle"}</button>
        {link && (
          <button
            type="button"
            className="btn-danger py-1.5"
            disabled={removing}
            onClick={() => {
              if (confirm("Veli bu öğrenciden kaldırılsın mı?")) {
                startTransition(() => void removeGuardian(studentId, link.guardianId));
              }
            }}
          >
            Kaldır
          </button>
        )}
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
      </div>
    </form>
  );
}
