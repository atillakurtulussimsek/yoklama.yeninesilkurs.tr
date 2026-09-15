"use client";

import { useState, useTransition } from "react";
import { createTelegramLinkCode, unlinkTelegram } from "./actions";

type Target = { teacherId: number } | { userId: number };

export default function TelegramLink({
  target,
  linked,
  botUsername,
}: {
  target: Target;
  linked: { username: string | null; fullName: string | null } | null;
  botUsername: string | null;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const result = await createTelegramLinkCode(target);
      if ("error" in result) setError(result.error!);
      else setCode(result.code!);
    });
  }

  function unlink() {
    if (!confirm("Telegram bağlantısı kaldırılsın mı?")) return;
    startTransition(async () => {
      const result = await unlinkTelegram(target);
      if ("error" in result) setError(result.error!);
    });
  }

  return (
    <div className="space-y-1 text-xs">
      {linked ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge bg-sky-100 text-sky-800 ring-sky-200">
            Telegram: {linked.username ? `@${linked.username}` : linked.fullName ?? "bağlı"}
          </span>
          <button type="button" className="text-gray-400 hover:text-red-600" onClick={unlink} disabled={pending}>
            kaldır
          </button>
        </div>
      ) : code ? (
        <div className="rounded-md bg-amber-50 px-2 py-1.5 text-amber-900">
          Bota gönderilecek komut (15 dk geçerli):
          <div className="mt-0.5 font-mono text-sm font-semibold select-all">/baglan {code}</div>
          {botUsername && <div className="text-amber-700">Bot: @{botUsername}</div>}
        </div>
      ) : (
        <button type="button" className="text-indigo-600 hover:underline" onClick={generate} disabled={pending}>
          {pending ? "..." : "Telegram bağlantı kodu oluştur"}
        </button>
      )}
      {error && <div className="text-red-600">{error}</div>}
    </div>
  );
}
