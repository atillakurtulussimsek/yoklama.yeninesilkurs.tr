"use client";

import { useActionState, useEffect, useRef } from "react";
import { assignUser } from "../actions";

export default function UserCreateForm() {
  const [state, action, pending] = useActionState(assignUser, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="fullName">Ad Soyad</label>
        <input className="input" id="fullName" name="fullName" required />
      </div>
      <div>
        <label className="label" htmlFor="username">Kullanıcı adı</label>
        <input className="input" id="username" name="username" autoComplete="off" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Şifre (yeni kullanıcı için, en az 8 karakter)</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" />
      </div>
      <div>
        <label className="label" htmlFor="role">Yetki</label>
        <select className="input" id="role" name="role" defaultValue="STAFF">
          <option value="STAFF">Görevli</option>
          <option value="ADMIN">Yönetici</option>
        </select>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>Ekle</button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
      </div>
    </form>
  );
}
