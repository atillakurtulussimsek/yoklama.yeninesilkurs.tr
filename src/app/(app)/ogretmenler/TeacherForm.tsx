"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { deleteTeacher, saveTeacher } from "./actions";

export type TeacherRow = {
  id: number;
  firstName: string;
  lastName: string;
  subject: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
};

export default function TeacherForm({ teacher }: { teacher?: TeacherRow }) {
  const [state, action, pending] = useActionState(saveTeacher, undefined);
  const [removing, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!teacher && state?.ok) formRef.current?.reset();
  }, [state, teacher]);

  return (
    <form ref={formRef} action={action} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_140px_1fr_auto] sm:items-center">
      {teacher && <input type="hidden" name="id" value={teacher.id} />}
      <input className="input" name="firstName" placeholder="Ad" defaultValue={teacher?.firstName} required aria-label="Ad" />
      <input className="input" name="lastName" placeholder="Soyad" defaultValue={teacher?.lastName} required aria-label="Soyad" />
      <input className="input" name="subject" placeholder="Branş" defaultValue={teacher?.subject ?? ""} aria-label="Branş" />
      <input className="input" name="phone" type="tel" placeholder="Telefon" defaultValue={teacher?.phone ?? ""} aria-label="Telefon" />
      <input className="input" name="email" type="email" placeholder="E-posta" defaultValue={teacher?.email ?? ""} aria-label="E-posta" />
      <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
        {teacher && (
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input type="checkbox" name="isActive" defaultChecked={teacher.isActive} />
            Aktif
          </label>
        )}
        <button className={teacher ? "btn-secondary" : "btn-primary"} disabled={pending}>
          {teacher ? "Kaydet" : "Ekle"}
        </button>
        {teacher && (
          <button
            type="button"
            className="btn-danger"
            disabled={removing}
            onClick={() =>
              confirm(`${teacher.firstName} ${teacher.lastName} silinsin mi?`) &&
              startTransition(() => void deleteTeacher(teacher.id))
            }
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
