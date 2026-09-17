import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getContext } from "@/lib/context";
import { downloadFile } from "@/lib/telegram";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Yetkisiz", { status: 401 });
  const { branch } = await getContext();
  const id = Number((await context.params).id);
  if (!branch || !Number.isInteger(id)) return new Response("Bulunamadı", { status: 404 });

  const slip = await prisma.attendanceSlip.findFirst({
    where: { id, branchId: branch.id },
    select: { imageData: true, imageMime: true, telegramFileId: true },
  });
  if (!slip) return new Response("Bulunamadı", { status: 404 });

  let bytes: Buffer | null = slip.imageData ? Buffer.from(slip.imageData) : null;
  let mime = slip.imageMime ?? "image/jpeg";
  if (!bytes && slip.telegramFileId) {
    try {
      const image = await downloadFile(slip.telegramFileId);
      bytes = Buffer.from(image.base64, "base64");
      mime = image.mime;
    } catch {
      return new Response("Görsel alınamadı", { status: 502 });
    }
  }
  if (!bytes) return new Response("Görsel yok", { status: 404 });

  return new Response(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) as BodyInit, {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600" },
  });
}
