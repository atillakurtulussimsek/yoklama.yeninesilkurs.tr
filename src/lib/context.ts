import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const CONTEXT_COOKIE = "yoklama_context";

/** Seçili kurum (şube) ve eğitim-öğretim yılı. Çerezde "branchId:academicYearId" olarak tutulur. */
export const getContext = cache(async () => {
  const [branches, academicYears] = await Promise.all([
    prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.academicYear.findMany({ orderBy: { startsOn: "desc" } }),
  ]);

  const cookieStore = await cookies();
  const [branchIdText, yearIdText] = (cookieStore.get(CONTEXT_COOKIE)?.value ?? "").split(":");

  const branch = branches.find((item) => item.id === Number(branchIdText)) ?? branches[0] ?? null;
  const academicYear =
    academicYears.find((item) => item.id === Number(yearIdText)) ??
    academicYears.find((item) => item.isCurrent) ??
    academicYears[0] ??
    null;

  return { branches, academicYears, branch, academicYear };
});

/** Oturum + kurum/yıl seçimi zorunlu sayfalar için. Tanım yoksa kuruluma yönlendirir. */
export async function requireContext() {
  const user = await requireUser();
  const context = await getContext();
  if (!context.branch || !context.academicYear) {
    redirect(user.role === "ADMIN" ? "/ayarlar/kurumlar" : "/kurulum-bekleniyor");
  }
  return { user, branch: context.branch, academicYear: context.academicYear };
}
