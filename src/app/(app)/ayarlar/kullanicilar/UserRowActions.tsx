"use client";

import { useTransition } from "react";
import { updateUserAccess } from "../actions";

type User = { id: number; fullName: string; role: "ADMIN" | "STAFF" };

export default function UserRowActions({ user, isSelf }: { user: User; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();

  function run(patch: Parameters<typeof updateUserAccess>[1]) {
    startTransition(async () => {
      const result = await updateUserAccess(user.id, patch);
      if ("error" in result) alert(result.error);
    });
  }

  return (
    <div className="flex justify-end gap-2">
      <button
        className="btn-secondary px-2.5 py-1 text-xs"
        disabled={pending}
        onClick={() => {
          const password = prompt(`${user.fullName} için yeni şifre (en az 8 karakter). Tüm projelerde geçerli olur:`);
          if (password) run({ password });
        }}
      >
        Şifre
      </button>
      {!isSelf && (
        <>
          <button
            className="btn-secondary px-2.5 py-1 text-xs"
            disabled={pending}
            onClick={() => run({ role: user.role === "ADMIN" ? "STAFF" : "ADMIN" })}
          >
            {user.role === "ADMIN" ? "Görevli yap" : "Yönetici yap"}
          </button>
          <button
            className="btn-danger px-2.5 py-1 text-xs"
            disabled={pending}
            onClick={() => confirm(`${user.fullName} için yoklama erişimi kaldırılsın mı?`) && run({ remove: true })}
          >
            Erişimi kaldır
          </button>
        </>
      )}
    </div>
  );
}
