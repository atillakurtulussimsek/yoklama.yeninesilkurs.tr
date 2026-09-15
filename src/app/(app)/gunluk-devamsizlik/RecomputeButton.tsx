"use client";

import { useState, useTransition } from "react";
import { recomputeDay } from "./actions";

export default function RecomputeButton({ date }: { date: string }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="btn-secondary"
        disabled={pending}
        title="Bu günün günlük devamsızlıklarını ders kayıtlarından yeniden türetir (açıklamalar korunur)"
        onClick={() =>
          startTransition(async () => {
            const result = await recomputeDay(date);
            setMessage("error" in result ? result.error! : `${result.count} öğrenci yeniden hesaplandı`);
          })
        }
      >
        {pending ? "Hesaplanıyor..." : "Yeniden hesapla"}
      </button>
      {message && <span className="text-xs text-gray-500">{message}</span>}
    </div>
  );
}
