import "server-only";
import { prisma } from "@/lib/db";

export type ChronicSettings = {
  windowDays: number;
  absenceThreshold: number;
  consecutiveThreshold: number;
};

export const DEFAULT_CHRONIC_SETTINGS: ChronicSettings = {
  windowDays: 30,
  absenceThreshold: 5,
  consecutiveThreshold: 3,
};

export async function getChronicSettings(branchId: number): Promise<ChronicSettings> {
  const row = await prisma.attendanceSetting.findUnique({ where: { branchId } });
  if (!row) return DEFAULT_CHRONIC_SETTINGS;
  return {
    windowDays: row.windowDays,
    absenceThreshold: row.absenceThreshold,
    consecutiveThreshold: row.consecutiveThreshold,
  };
}

export async function saveChronicSettings(branchId: number, settings: ChronicSettings) {
  await prisma.attendanceSetting.upsert({
    where: { branchId },
    create: { branchId, ...settings },
    update: settings,
  });
}
