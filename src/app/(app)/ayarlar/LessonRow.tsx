"use client";

import { useActionState, useTransition } from "react";
import type { DaySession } from "@/generated/prisma/enums";
import { SESSION_LABELS } from "@/lib/dayAbsence";
import { removeLesson, restoreLesson, saveLesson } from "./actions";

type Lesson = {
  id: number;
  orderNo: number;
  name: string;
  session: DaySession;
  startTime: string | null;
  endTime: string | null;
  isActive: boolean;
};

export default function LessonRow({ lesson, nextOrder }: { lesson?: Lesson; nextOrder?: number }) {
  const [state, action, pending] = useActionState(saveLesson, undefined);
  const [removing, startTransition] = useTransition();
  const defaultSession: DaySession = lesson?.session ?? ((nextOrder ?? 1) >= 5 ? "AFTERNOON" : "MORNING");

  return (
    <form
      action={action}
      className={`grid grid-cols-2 items-center gap-2 rounded-lg p-1 sm:grid-cols-[70px_1fr_140px_110px_110px_auto] ${
        lesson && !lesson.isActive ? "opacity-50" : ""
      } ${!lesson ? "border border-dashed border-gray-300 bg-gray-50" : ""}`}
    >
      {lesson && <input type="hidden" name="id" value={lesson.id} />}
      <input className="input" type="number" name="orderNo" min={1} defaultValue={lesson?.orderNo ?? nextOrder} aria-label="Sıra" />
      <input className="input" name="name" defaultValue={lesson?.name ?? (nextOrder ? `${nextOrder}. Ders` : "")} aria-label="Ders adı" />
      <select className="input" name="session" defaultValue={defaultSession} aria-label="Oturum">
        {(Object.keys(SESSION_LABELS) as DaySession[]).map((session) => (
          <option key={session} value={session}>{SESSION_LABELS[session]}</option>
        ))}
      </select>
      <input className="input" type="time" name="startTime" defaultValue={lesson?.startTime ?? ""} aria-label="Başlangıç" />
      <input className="input" type="time" name="endTime" defaultValue={lesson?.endTime ?? ""} aria-label="Bitiş" />
      <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
        <button className={lesson ? "btn-secondary" : "btn-primary"} disabled={pending}>
          {lesson ? "Kaydet" : "Ekle"}
        </button>
        {lesson?.isActive && (
          <button
            type="button"
            className="btn-danger"
            disabled={removing}
            onClick={() => confirm(`"${lesson.name}" kaldırılsın mı?`) && startTransition(() => void removeLesson(lesson.id))}
          >
            Kaldır
          </button>
        )}
        {lesson && !lesson.isActive && (
          <button type="button" className="btn-secondary" disabled={removing} onClick={() => startTransition(() => void restoreLesson(lesson.id))}>
            Geri al
          </button>
        )}
      </div>
      {(state?.error || state?.ok) && (
        <p className={`col-span-full px-1 text-xs ${state.error ? "text-red-600" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
