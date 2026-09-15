import "server-only";
import { getMe, isTelegramConfigured } from "@/lib/telegram";

let cached: { username: string; at: number } | null = null;

/** Bot kullanıcı adı (1 saat önbellek). Yapılandırılmamışsa null. */
export async function getBotUsername() {
  if (!isTelegramConfigured()) return null;
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.username;
  try {
    const me = await getMe();
    cached = { username: me.username, at: Date.now() };
    return me.username;
  } catch {
    return null;
  }
}
