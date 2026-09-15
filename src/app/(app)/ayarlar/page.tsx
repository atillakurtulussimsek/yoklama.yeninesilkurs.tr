import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { requireContext } from "@/lib/context";
import { getChronicSettings } from "@/lib/settings";
import { getBotUsername } from "@/lib/botInfo";
import { isTelegramConfigured } from "@/lib/telegram";
import AiSettingsForm from "./AiSettingsForm";
import ChronicForm from "./ChronicForm";
import TelegramSetup from "./TelegramSetup";
import LessonRow from "./LessonRow";

export default async function SettingsPage() {
  await requireAdmin();
  const { branch } = await requireContext();
  const [settings, lessons, ai, botUsername] = await Promise.all([
    getChronicSettings(branch.id),
    prisma.lessonPeriod.findMany({ where: { branchId: branch.id }, orderBy: [{ isActive: "desc" }, { orderNo: "asc" }] }),
    prisma.branchAiSetting.findUnique({ where: { branchId: branch.id } }),
    getBotUsername(),
  ]);
  const webhookUrl = `${(process.env.APP_URL ?? "").replace(/\/+$/, "")}/api/telegram/webhook`;
  const nextOrder = Math.max(0, ...lessons.map((lesson) => lesson.orderNo)) + 1;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Yoklama Ayarları</h1>
        <p className="text-sm text-gray-500">{branch.name}</p>
      </div>

      <section className="card p-5">
        <h2 className="font-semibold">Sürekli devamsızlık kriterleri</h2>
        <p className="mb-4 text-sm text-gray-500">
          Öğrenci, seçilen dönemde eşiklerden birini aşarsa sürekli devamsız listesinde görünür.
        </p>
        <ChronicForm settings={settings} />
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Dersler</h2>
        <p className="mb-4 text-sm text-gray-500">
          Ders ders yoklama için tanımlanır; oturum bilgisi yarım gün hesabında kullanılır. Ders tanımlanmazsa yalnızca günlük yoklama alınır.
        </p>
        <div className="space-y-2">
          <div className="hidden grid-cols-[70px_1fr_140px_110px_110px_auto] gap-2 px-1 text-xs font-medium text-gray-500 sm:grid">
            <span>Sıra</span>
            <span>Ders adı</span>
            <span>Oturum</span>
            <span>Başlangıç</span>
            <span>Bitiş</span>
            <span />
          </div>
          {lessons.map((lesson) => (
            <LessonRow key={lesson.id} lesson={lesson} />
          ))}
          <LessonRow key={`new-${nextOrder}`} nextOrder={nextOrder} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Yapay zeka (yoklama fişi okuma)</h2>
        <p className="mb-4 text-sm text-gray-500">
          OpenAI uyumlu bir API. Görsel okuyabilen bir model seçin. Ayarlar yalnızca bu kurum için geçerlidir.
        </p>
        <AiSettingsForm settings={{ baseUrl: ai?.baseUrl ?? "https://api.openai.com/v1", model: ai?.model ?? "", hasKey: Boolean(ai) }} />
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Telegram botu</h2>
        <p className="mb-3 text-sm text-gray-500">
          {isTelegramConfigured()
            ? botUsername
              ? `Bot: @${botUsername}. Öğretmenler ve kullanıcılar bağlantı koduyla eşleştirilir.`
              : "Bot token tanımlı ancak Telegram'a ulaşılamadı."
            : "TELEGRAM_BOT_TOKEN ve TELEGRAM_WEBHOOK_SECRET ortam değişkenleri tanımlanmalı."}
        </p>
        {isTelegramConfigured() && <TelegramSetup webhookUrl={webhookUrl} />}
      </section>
    </div>
  );
}
