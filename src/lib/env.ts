/** Ortam değişkenini okur; panel/dosyadan gelen tırnak ve boşlukları temizler. */
export function env(name: string) {
  const raw = process.env[name];
  if (raw === undefined) return "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

export function telegramEnvStatus() {
  return {
    botToken: Boolean(env("TELEGRAM_BOT_TOKEN")),
    webhookSecret: Boolean(env("TELEGRAM_WEBHOOK_SECRET")),
    appUrl: Boolean(env("APP_URL")),
  };
}
