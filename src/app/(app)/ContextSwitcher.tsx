"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setContext } from "./actions";

type Option = { id: number; name: string };

export default function ContextSwitcher({
  branches,
  academicYears,
  branchId,
  academicYearId,
}: {
  branches: Option[];
  academicYears: Option[];
  branchId: number;
  academicYearId: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(nextBranchId: number, nextYearId: number) {
    startTransition(async () => {
      await setContext(nextBranchId, nextYearId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 px-4 pb-3">
      <select
        className="input py-1.5 text-xs"
        value={branchId}
        disabled={pending}
        onChange={(event) => change(Number(event.target.value), academicYearId)}
        aria-label="Kurum"
      >
        {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
      </select>
      <select
        className="input py-1.5 text-xs"
        value={academicYearId}
        disabled={pending}
        onChange={(event) => change(branchId, Number(event.target.value))}
        aria-label="Eğitim-öğretim yılı"
      >
        {academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
      </select>
    </div>
  );
}
