"use client";

import { useActionState } from "react";
import { login, setupAdmin } from "./actions";

export default function LoginForm({ needsSetup }: { needsSetup: boolean }) {
  const [state, action, pending] = useActionState(needsSetup ? setupAdmin : login, undefined);

  return (
    <form action={action} className="space-y-4">
      {needsSetup && (
        <div>
          <label className="label" htmlFor="fullName">Ad Soyad</label>
          <input className="input" id="fullName" name="fullName" required />
        </div>
      )}
      <div>
        <label className="label" htmlFor="username">Kullanıcı adı</label>
        <input className="input" id="username" name="username" autoComplete="username" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Şifre</label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete={needsSetup ? "new-password" : "current-password"}
          required
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Bekleyin..." : needsSetup ? "Hesabı oluştur" : "Giriş yap"}
      </button>
    </form>
  );
}
