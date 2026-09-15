"use client";

import { useActionState } from "react";
import type { ChronicSettings } from "@/lib/settings";
import { updateChronicSettings } from "./actions";

export default function ChronicForm({ settings }: { settings: ChronicSettings }) {
  const [state, action, pending] = useActionState(updateChronicSettings, undefined);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="windowDays">Dönem (son kaç gün)</label>
          <input className="input" type="number" min={1} max={365} id="windowDays" name="windowDays" defaultValue={settings.windowDays} />
        </div>
        <div>
          <label className="label" htmlFor="absenceThreshold">Toplam devamsız gün eşiği</label>
          <input className="input" type="number" min={1} id="absenceThreshold" name="absenceThreshold" defaultValue={settings.absenceThreshold} />
        </div>
        <div>
          <label className="label" htmlFor="consecutiveThreshold">Üst üste devamsız gün eşiği</label>
          <input className="input" type="number" min={1} id="consecutiveThreshold" name="consecutiveThreshold" defaultValue={settings.consecutiveThreshold} />
        </div>
      </div>
      <p className="text-xs text-gray-500">
        Gün hesabı: bir oturumda (sabah / öğleden sonra) 2+ derse gelmeme = yarım gün, günün tüm derslerine gelmeme = tam gün,
        oturumda tek ders = geç. Geç gelen var sayılır, mazeretli devamsız sayılır.
      </p>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>Kaydet</button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
      </div>
    </form>
  );
}
