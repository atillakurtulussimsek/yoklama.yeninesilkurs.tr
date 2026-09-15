"use client";

import { useState, useTransition } from "react";
import { setupTelegramWebhook } from "./actions";

export default function TelegramSetup({ webhookUrl }: { webhookUrl: string }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2 text-sm">
      <p className="text-gray-600">
        Webhook adresi: <code className="rounded bg-gray-100 px-1">{webhookUrl}</code>
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setupTelegramWebhook();
              setMessage("error" in result ? { ok: false, text: result.error! } : { ok: true, text: result.ok! });
            })
          }
        >
          {pending ? "Kuruluyor..." : "Webhook'u kur / yenile"}
        </button>
        {message && <span className={message.ok ? "text-emerald-700" : "text-red-600"}>{message.text}</span>}
      </div>
    </div>
  );
}
