"use client";

import { useTransition } from "react";
import { deleteEnrollment, setEnrollmentStatus } from "../actions";

export default function EnrollmentActions({
  id,
  status,
  isAdmin,
}: {
  id: number;
  status: "ACTIVE" | "CANCELLED";
  isAdmin: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const active = status === "ACTIVE";

  return (
    <div className="flex gap-2">
      <button
        className="btn-secondary"
        disabled={pending}
        onClick={() => {
          const text = active
            ? "Kayıt iptal edilsin mi? (yoklama listelerinde görünmez, geçmişi korunur)"
            : "Kayıt tekrar aktif yapılsın mı?";
          if (confirm(text)) startTransition(() => void setEnrollmentStatus(id, active ? "CANCELLED" : "ACTIVE"));
        }}
      >
        {active ? "Kaydı iptal et" : "Kaydı aktif yap"}
      </button>
      {isAdmin && (
        <button
          className="btn-danger"
          disabled={pending}
          onClick={() => {
            if (confirm("Bu yılın kaydı ve TÜM devamsızlık geçmişi kalıcı olarak silinecek. Emin misiniz?")) {
              startTransition(() => void deleteEnrollment(id));
            }
          }}
        >
          Sil
        </button>
      )}
    </div>
  );
}
