// K12 öğrenci Excel'ini komut satırından aktarır.
// Kullanım: npx tsx scripts/import-k12.ts <dosya.xlsx> --kurum <slug> --yil <2026-2027> [--iptal-et]
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getDatabaseUrl } from "../src/lib/databaseUrl";
import { importK12Workbook } from "../src/lib/studentImport";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index > -1 ? process.argv[index + 1] : undefined;
}

async function main() {
  const filePath = process.argv[2];
  const branchSlug = argValue("--kurum");
  const yearName = argValue("--yil");
  if (!filePath || !branchSlug || !yearName) {
    throw new Error("Kullanım: npx tsx scripts/import-k12.ts <dosya.xlsx> --kurum <slug> --yil <2026-2027> [--iptal-et]");
  }

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(getDatabaseUrl()) });
  try {
    const [branch, year] = await Promise.all([
      prisma.branch.findUnique({ where: { slug: branchSlug } }),
      prisma.academicYear.findUnique({ where: { name: yearName } }),
    ]);
    if (!branch) throw new Error(`Kurum bulunamadı: ${branchSlug}`);
    if (!year) throw new Error(`Yıl bulunamadı: ${yearName}`);

    const file = await readFile(filePath);
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const result = await importK12Workbook(prisma, buffer, {
      branchId: branch.id,
      academicYearId: year.id,
      deactivateMissing: process.argv.includes("--iptal-et"),
    });

    if (result.error) console.error("HATA:", result.error);
    if (result.summary) console.log(`${branch.name} · ${year.name}`, result.summary);
    for (const item of result.skipped ?? []) console.log(`Aktarılmadı – ${item.row}. satır: ${item.reason}`);
    if (result.error) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
