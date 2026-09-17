import "server-only";
import { env } from "@/lib/env";

// Telegram Bot API – yalnızca ihtiyaç duyulan uçlar, kütüphanesiz

export type TelegramUser = { id: number; first_name?: string; last_name?: string; username?: string };
export type TelegramPhotoSize = { file_id: string; width: number; height: number };
export type TelegramMessage = {
  message_id: number;
  chat: { id: number; type: string };
  from?: TelegramUser;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: { file_id: string; mime_type?: string; file_name?: string };
};
export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: TelegramMessage;
};
export type TelegramUpdate = { update_id: number; message?: TelegramMessage; callback_query?: TelegramCallbackQuery };

export type InlineKeyboard = { text: string; callback_data: string }[][];

function token() {
  const value = env("TELEGRAM_BOT_TOKEN");
  if (!value) throw new Error("TELEGRAM_BOT_TOKEN tanımlı değil");
  return value;
}

export function isTelegramConfigured() {
  return Boolean(env("TELEGRAM_BOT_TOKEN") && env("TELEGRAM_WEBHOOK_SECRET"));
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? response.status}`);
  return json.result as T;
}

export function sendMessage(chatId: string | number, text: string, keyboard?: InlineKeyboard) {
  return call<TelegramMessage>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export function editMessageText(chatId: string | number, messageId: number, text: string, keyboard?: InlineKeyboard) {
  return call<unknown>("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard ?? [] },
  });
}

export function answerCallbackQuery(id: string, text?: string) {
  return call<boolean>("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

export function sendChatAction(chatId: string | number, action = "typing") {
  return call<boolean>("sendChatAction", { chat_id: chatId, action }).catch(() => false);
}

/** Dosyayı indirir; base64 ve mime döndürür. */
export async function downloadFile(fileId: string) {
  const file = await call<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("Telegram dosya yolu alınamadı");
  const response = await fetch(`https://api.telegram.org/file/bot${token()}/${file.file_path}`);
  if (!response.ok) throw new Error("Telegram dosyası indirilemedi");
  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = file.file_path.split(".").pop()?.toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return { base64: buffer.toString("base64"), mime, size: buffer.length };
}

export async function setWebhook(url: string) {
  const secret = env("TELEGRAM_WEBHOOK_SECRET");
  if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET tanımlı değil");
  return call<boolean>("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
}

export function getWebhookInfo() {
  return call<{ url: string; pending_update_count: number; last_error_message?: string; last_error_date?: number }>(
    "getWebhookInfo",
    {},
  );
}

export function getMe() {
  return call<{ username: string; first_name: string }>("getMe", {});
}

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
