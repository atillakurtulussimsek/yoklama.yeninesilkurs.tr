"use client";

import { useActionState } from "react";
import { saveStudent } from "./actions";

type Enrollment = {
  id: number;
  studentNo: number;
  classGroupId: number | null;
  field: string | null;
  student: { nationalId: string; firstName: string; lastName: string; phone: string | null };
};

export default function StudentForm({
  enrollment,
  classGroups,
}: {
  enrollment?: Enrollment;
  classGroups: { id: number; label: string }[];
}) {
  const [state, action, pending] = useActionState(saveStudent, undefined);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {enrollment && <input type="hidden" name="enrollmentId" value={enrollment.id} />}
      <div>
        <label className="label" htmlFor="nationalId">TC kimlik no</label>
        <input className="input" id="nationalId" name="nationalId" inputMode="numeric" maxLength={11} defaultValue={enrollment?.student.nationalId} required />
      </div>
      <div>
        <label className="label" htmlFor="studentNo">Öğrenci no</label>
        <input className="input" id="studentNo" name="studentNo" type="number" defaultValue={enrollment?.studentNo} required />
      </div>
      <div>
        <label className="label" htmlFor="firstName">Ad</label>
        <input className="input" id="firstName" name="firstName" defaultValue={enrollment?.student.firstName} required />
      </div>
      <div>
        <label className="label" htmlFor="lastName">Soyad</label>
        <input className="input" id="lastName" name="lastName" defaultValue={enrollment?.student.lastName} required />
      </div>
      <div>
        <label className="label" htmlFor="classGroupId">Sınıf</label>
        <select className="input" id="classGroupId" name="classGroupId" defaultValue={enrollment?.classGroupId ?? 0}>
          <option value={0}>Şubesiz</option>
          {classGroups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="field">Alan</label>
        <input className="input" id="field" name="field" placeholder="SAY, EA, TYT..." defaultValue={enrollment?.field ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="phone">Öğrenci telefonu</label>
        <input className="input" id="phone" name="phone" type="tel" defaultValue={enrollment?.student.phone ?? ""} />
      </div>

      {!enrollment && (
        <fieldset className="grid gap-4 rounded-lg border border-gray-200 p-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="px-1 text-xs font-medium text-gray-600">Veli (isteğe bağlı)</legend>
          <div>
            <label className="label" htmlFor="guardianRelation">Yakınlık</label>
            <select className="input" id="guardianRelation" name="guardianRelation" defaultValue="">
              <option value="">Seçin</option>
              <option value="MOTHER">Anne</option>
              <option value="FATHER">Baba</option>
              <option value="OTHER">Diğer</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="guardianPhone">Telefon</label>
            <input className="input" id="guardianPhone" name="guardianPhone" type="tel" />
          </div>
          <div>
            <label className="label" htmlFor="guardianFirstName">Ad</label>
            <input className="input" id="guardianFirstName" name="guardianFirstName" />
          </div>
          <div>
            <label className="label" htmlFor="guardianLastName">Soyad</label>
            <input className="input" id="guardianLastName" name="guardianLastName" />
          </div>
        </fieldset>
      )}

      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Kaydediliyor..." : "Kaydet"}</button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
      </div>
    </form>
  );
}
