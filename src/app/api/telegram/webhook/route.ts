import { after } from "next/server";
import type { NextRequest } from "next/server";
import { handleTelegramUpdate } from "@/lib/slipProcessing";
import type { TelegramUpdate } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("Yetkisiz", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("Geçersiz istek", { status: 400 });
  }

  // Telegram hızlı yanıt bekler; işleme yanıttan sonra devam eder
  after(async () => {
    try {
      await handleTelegramUpdate(update);
    } catch (error) {
      console.error("Telegram güncellemesi işlenemedi", error);
    }
  });

  return Response.json({ ok: true });
}
