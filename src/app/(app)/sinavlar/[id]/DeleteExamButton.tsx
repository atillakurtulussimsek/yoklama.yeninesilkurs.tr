"use client";

import { useTransition } from "react";
import { deleteExam } from "../actions";

export default function DeleteExamButton({ id }: { id: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn-danger"
      disabled={pending}
      onClick={() => confirm("Sınav ve yoklaması silinsin mi?") && startTransition(() => void deleteExam(id))}
    >
      Sil
    </button>
  );
}
