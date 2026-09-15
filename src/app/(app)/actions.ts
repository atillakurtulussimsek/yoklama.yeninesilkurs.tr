"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { CONTEXT_COOKIE } from "@/lib/context";

export async function setContext(branchId: number, academicYearId: number) {
  if (!(await getCurrentUser())) return;
  const cookieStore = await cookies();
  cookieStore.set(CONTEXT_COOKIE, `${branchId}:${academicYearId}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
