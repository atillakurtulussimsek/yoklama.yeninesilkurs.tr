// Yerel geliştirme: webhook yerine Telegram'ı sorgulayarak güncellemeleri işler.
// Kullanım: npm run telegram:poll   (üretimde webhook kullanılır; bu betik webhook'u kaldırır)
import "dotenv/config";
import { handleTelegramUpdate } from "../src/lib/slipProcessing";
import type { TelegramUpdate } from "../src/lib/telegram";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN tanımlı değil");
const api = `https://api.telegram.org/bot${token}`;

async function main() {
  await fetch(`${api}/deleteWebhook`, { method: "POST" });
  console.log("Webhook kaldırıldı, güncellemeler dinleniyor... (Ctrl+C ile çıkın)");
  let offset = 0;
  for (;;) {
    try {
      const response = await fetch(`${api}/getUpdates?timeout=30&offset=${offset}&allowed_updates=["message","callback_query"]`);
      const json = (await response.json()) as { ok: boolean; result?: TelegramUpdate[] };
      for (const update of json.result ?? []) {
        offset = update.update_id + 1;
        const who = update.message?.from?.username ?? update.callback_query?.from.username ?? "?";
        console.log(new Date().toLocaleTimeString("tr-TR"), `@${who}:`, update.message?.text ?? (update.message?.photo ? "[foto]" : update.callback_query?.data ?? ""));
        await handleTelegramUpdate(update).catch((error) => console.error("İşleme hatası:", error));
      }
    } catch (error) {
      console.error("Bağlantı hatası:", error instanceof Error ? error.message : error);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

main();
