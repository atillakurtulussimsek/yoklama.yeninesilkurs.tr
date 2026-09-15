import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, decrypt } from "@/lib/session";

/** Ortak users tablosunda bu projenin adı. */
export const PROJECT = "yoklama";

export type ProjectRole = "ADMIN" | "STAFF";

export const ROLE_LABELS: Record<ProjectRole, string> = {
  ADMIN: "Yönetici",
  STAFF: "Görevli",
};

export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies();
  const session = await decrypt(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      fullName: true,
      isActive: true,
      projectRoles: { where: { project: PROJECT }, select: { role: true } },
    },
  });
  const role = user?.projectRoles[0]?.role;
  if (!user || !user.isActive || (role !== "ADMIN" && role !== "STAFF")) return null;

  return { id: user.id, username: user.username, fullName: user.fullName, role: role as ProjectRole };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/giris");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}
