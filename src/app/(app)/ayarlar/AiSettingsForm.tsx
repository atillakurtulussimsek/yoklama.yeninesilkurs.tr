"use client";

import { useActionState } from "react";
import { updateAiSettings } from "./actions";

export default function AiSettingsForm({ settings }: { settings: { baseUrl: string; model: string; hasKey: boolean } }) {
  const [state, action, pending] = useActionState(updateAiSettings, undefined);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="baseUrl">API adresi (base URL)</label>
          <input className="input" id="baseUrl" name="baseUrl" placeholder="https://api.openai.com/v1" defaultValue={settings.baseUrl} required />
        </div>
        <div>
          <label className="label" htmlFor="model">Model</label>
          <input className="input" id="model" name="model" placeholder="gpt-4o-mini" defaultValue={settings.model} required />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="apiKey">API anahtarı {settings.hasKey && "(kayıtlı; değiştirmek için yeni anahtar girin)"}</label>
          <input className="input" id="apiKey" name="apiKey" type="password" autoComplete="off" placeholder={settings.hasKey ? "••••••••" : "sk-..."} required={!settings.hasKey} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>Kaydet</button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
      </div>
    </form>
  );
}
