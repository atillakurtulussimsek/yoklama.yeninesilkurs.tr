"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getContext } from "@/lib/context";
import { applyAttendance } from "@/lib/attendance";
import { isDateStr, toDbDate } from "@/lib/dates";

const saveSchema = z.object({
  date: z.string().refine(isDateStr, "Geçersiz tarih"),
  slot: z.number().int().min(0),
  entries: z
    .array(
      z.object({
        enrollmentId: z.number().int().positive(),
        status: z.enum(["ABSENT", "LATE", "EARLY_LEAVE", "EXCUSED"]).nullable(),
        note: z.string().trim().max(255).optional(),
      }),
    )
    .min(1),
});

export type SaveAttendanceInput = z.infer<typeof saveSchema>;

export async function saveAttendance(input: SaveAttendanceInput) {
  const user = await getCurrentUser();
  if (!user) return { error: "Oturum sona erdi, tekrar giriş yapın" };
  const { branch, academicYear } = await getContext();
  if (!branch || !academicYear) return { error: "Kurum veya yıl seçili değil" };

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await applyAttendance({
    branchId: branch.id,
    academicYearId: academicYear.id,
    date: toDbDate(parsed.data.date),
    slot: parsed.data.slot,
    entries: parsed.data.entries,
    actor: { userId: user.id },
  });
  if ("error" in result) return result;

  revalidatePath("/", "layout");
  return result;
}
