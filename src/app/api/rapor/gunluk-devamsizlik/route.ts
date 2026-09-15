import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getContext } from "@/lib/context";
import { getDailyAbsences, parseDailyFilter } from "@/lib/dailyAbsenceReport";
import { renderDailyAbsencePdf } from "@/lib/dailyAbsencePdf";
import { getClassGroupOptions } from "@/lib/reports";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Yetkisiz", { status: 401 });
  const { branch, academicYear } = await getContext();
  if (!branch || !academicYear) return new Response("Kurum veya yıl seçili değil", { status: 400 });

  const filter = parseDailyFilter(Object.fromEntries(request.nextUrl.searchParams));
  const [rows, classGroups] = await Promise.all([
    getDailyAbsences(branch.id, academicYear.id, filter),
    getClassGroupOptions(branch.id, academicYear.id),
  ]);
  const className = classGroups.find((group) => group.id === filter.classGroupId)?.label;

  const buffer = await renderDailyAbsencePdf({
    branchName: branch.name,
    academicYearName: academicYear.name,
    className,
    filter,
    rows,
    preparedBy: user.fullName,
  });
  const suffix = className ? `-${className.replace(/\//g, "")}` : "";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`gunluk-devamsizlik-${filter.date}${suffix}.pdf`)}`,
    },
  });
}
