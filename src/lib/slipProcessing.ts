import "server-only";
import { prisma } from "@/lib/db";
import type { ParsedSlip } from "@/lib/ai";
import { fullName } from "@/lib/classGroups";
import { formatDate } from "@/lib/dates";
import { STATUS_LABELS } from "@/lib/labels";
import type { MatchResult } from "@/lib/slipMatching";
import { analyzeSlip, applySlip } from "@/lib/slipCore";
import {
  answerCallbackQuery,
  downloadFile,
  editMessageText,
  escapeHtml,
  sendChatAction,
  sendMessage,
  type TelegramCallbackQuery,
  type TelegramMessage,
  type TelegramUpdate,
} from "@/lib/telegram";

const LINK_CODE_TTL_MS = 15 * 60 * 1000;

export function generateLinkCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export function linkCodeExpiry() {
  return new Date(Date.now() + LINK_CODE_TTL_MS);
}

async function findAccount(chatId: string) {
  return prisma.telegramAccount.findUnique({
    where: { chatId },
    include: {
      user: { select: { id: true, fullName: true, isActive: true } },
      teacher: { select: { id: true, firstName: true, lastName: true, isActive: true } },
      branch: { select: { id: true, name: true, isActive: true } },
    },
  });
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.callback_query) return handleCallback(update.callback_query);
  if (update.message) return handleMessage(update.message);
}

async function handleMessage(message: TelegramMessage) {
  if (message.chat.type !== "private") return;
  const chatId = String(message.chat.id);
  const text = (message.text ?? "").trim();

  if (text.startsWith("/start") || text.startsWith("/yardim") || text.startsWith("/help")) {
    const account = await findAccount(chatId);
    await sendMessage(
      chatId,
      account
        ? `Merhaba ${escapeHtml(accountName(account))}. Yoklama fişinin fotoğrafını gönderin, çözümleyip onayınıza sunayım.\n\n/durum – hesap bilgisi\n/iptal – bekleyen fişi iptal et`
        : "Merhaba. Bu bot Yeni Nesil yoklama sistemine bağlıdır. Yöneticinizden aldığınız bağlantı kodunu şu şekilde gönderin:\n<code>/baglan KOD</code>",
    );
    return;
  }

  if (text.startsWith("/baglan")) return linkAccount(message, text.slice(7).trim());

  const account = await findAccount(chatId);
  if (!account) {
    await sendMessage(chatId, "Hesabınız bağlı değil. Yöneticinizden bağlantı kodu alıp <code>/baglan KOD</code> gönderin.");
    return;
  }
  if (!isAccountActive(account)) {
    await sendMessage(chatId, "Hesabınız pasif durumda. Yöneticinizle görüşün.");
    return;
  }

  if (text.startsWith("/durum")) {
    await sendMessage(chatId, `Bağlı hesap: <b>${escapeHtml(accountName(account))}</b>\nKurum: ${escapeHtml(account.branch.name)}`);
    return;
  }
  if (text.startsWith("/iptal")) {
    const cancelled = await prisma.attendanceSlip.updateMany({
      where: { chatId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    await sendMessage(chatId, cancelled.count ? "Bekleyen fiş iptal edildi." : "Bekleyen fiş yok.");
    return;
  }

  const photo = message.photo?.at(-1);
  const document = message.document?.mime_type?.startsWith("image/") ? message.document : null;
  const fileId = photo?.file_id ?? document?.file_id;
  if (!fileId) {
    await sendMessage(chatId, "Yoklama fişinin fotoğrafını gönderin. Yardım için /yardim");
    return;
  }

  await processSlip(account, fileId, message.caption);
}

type Account = NonNullable<Awaited<ReturnType<typeof findAccount>>>;

function accountName(account: Account) {
  return account.user?.fullName ?? (account.teacher ? fullName(account.teacher) : "Bilinmiyor");
}

function isAccountActive(account: Account) {
  if (!account.branch.isActive) return false;
  if (account.user) return account.user.isActive;
  if (account.teacher) return account.teacher.isActive;
  return false;
}

async function linkAccount(message: TelegramMessage, code: string) {
  const chatId = String(message.chat.id);
  if (!code) {
    await sendMessage(chatId, "Kod eksik. Örnek: <code>/baglan AB12CD</code>");
    return;
  }
  const link = await prisma.telegramLinkCode.findUnique({
    where: { code: code.toUpperCase() },
    include: { user: true, teacher: true, branch: true },
  });
  if (!link || link.usedAt || link.expiresAt < new Date()) {
    await sendMessage(chatId, "Kod geçersiz veya süresi dolmuş. Yöneticinizden yeni kod isteyin.");
    return;
  }

  const from = message.from;
  const data = {
    branchId: link.branchId,
    userId: link.userId,
    teacherId: link.teacherId,
    username: from?.username ?? null,
    fullName: [from?.first_name, from?.last_name].filter(Boolean).join(" ") || null,
    linkedAt: new Date(),
  };
  await prisma.$transaction([
    // Aynı kişiye bağlı eski sohbetler kaldırılır
    prisma.telegramAccount.deleteMany({
      where: link.userId ? { userId: link.userId } : { teacherId: link.teacherId! },
    }),
    prisma.telegramAccount.upsert({ where: { chatId }, create: { chatId, ...data }, update: data }),
    prisma.telegramLinkCode.update({ where: { id: link.id }, data: { usedAt: new Date() } }),
  ]);

  const name = link.user?.fullName ?? (link.teacher ? fullName(link.teacher) : "");
  await sendMessage(
    chatId,
    `Hesabınız bağlandı: <b>${escapeHtml(name)}</b> · ${escapeHtml(link.branch.name)}\n\nArtık yoklama fişinin fotoğrafını gönderebilirsiniz.`,
  );
}

async function processSlip(account: Account, fileId: string, caption?: string) {
  const chatId = account.chatId;
  const branchId = account.branchId;
  const academicYear = await prisma.academicYear.findFirst({ orderBy: [{ isCurrent: "desc" }, { startsOn: "desc" }] });
  if (!academicYear) {
    await sendMessage(chatId, "Sistemde eğitim-öğretim yılı tanımlı değil.");
    return;
  }

  // Önceki bekleyen fişi iptal et
  await prisma.attendanceSlip.updateMany({ where: { chatId, status: "PENDING" }, data: { status: "CANCELLED" } });

  const slip = await prisma.attendanceSlip.create({
    data: {
      branchId,
      academicYearId: academicYear.id,
      source: "TELEGRAM",
      status: "ANALYZING",
      chatId,
      userId: account.userId,
      teacherId: account.teacherId,
      telegramFileId: fileId,
    },
  });

  const [downloaded] = await Promise.all([
    downloadFile(fileId).then(
      (image) => ({ image }),
      (error: unknown) => ({ error: error instanceof Error ? error.message : "Görsel indirilemedi" }),
    ),
    sendMessage(chatId, "Fiş alındı, çözümleniyor..."),
    sendChatAction(chatId),
  ]);
  if ("error" in downloaded) {
    await prisma.attendanceSlip.update({ where: { id: slip.id }, data: { status: "FAILED", errorMessage: downloaded.error } });
    await sendMessage(chatId, `⚠️ ${escapeHtml(downloaded.error)}`);
    return;
  }

  // Açıklama metninde tarih belirtilmişse fişteki tarihi geçersiz kılar (örn. "12.09.2026")
  const captionDate = caption?.match(/(\d{1,2}[./]\d{1,2}[./]\d{4})/)?.[1] ?? null;
  const result = await analyzeSlip(slip.id, downloaded.image, { dateOverride: captionDate });
  if ("error" in result) {
    await sendMessage(chatId, `⚠️ ${escapeHtml(result.error)}`);
    return;
  }
  const { matched, parsed, ms } = result;
  const text = buildPreview(parsed, matched, ms);
  const keyboard = matched.classGroupId && matched.lessons.length
    ? [
        [
          { text: "✅ Onayla ve kaydet", callback_data: `slip:${slip.id}:ok` },
          { text: "❌ İptal", callback_data: `slip:${slip.id}:no` },
        ],
      ]
    : [[{ text: "❌ Kapat", callback_data: `slip:${slip.id}:no` }]];
  const preview = await sendMessage(chatId, text, keyboard);
  await prisma.attendanceSlip.update({ where: { id: slip.id }, data: { previewMessageId: preview.message_id } });
}

function buildPreview(parsed: ParsedSlip | null, matched: MatchResult, ms: number) {
  const lines: string[] = ["<b>Yoklama fişi çözümlendi</b>", ""];
  lines.push(`Sınıf: <b>${matched.className ? escapeHtml(matched.className) : `⚠️ bulunamadı (${escapeHtml(parsed?.className ?? "-")})`}</b>`);
  lines.push(`Tarih: <b>${formatDate(matched.date)}</b>${parsed?.date ? "" : " (fişte okunamadı, bugün alındı)"}`);
  lines.push("");
  if (matched.lessons.length === 0) {
    lines.push("⚠️ Fişte işlenmiş ders bulunamadı.");
  }
  for (const lesson of matched.lessons) {
    const title = `<b>${lesson.lessonNo}. Ders${lesson.subject ? ` – ${escapeHtml(lesson.subject)}` : ""}</b>`;
    if (lesson.absences.length === 0) {
      lines.push(`${title}: Tam (devamsız yok)`);
      continue;
    }
    lines.push(title);
    for (const absence of lesson.absences) {
      const status = STATUS_LABELS[absence.status];
      if (absence.enrollmentId) {
        const warn = absence.score < 0.8 ? " ⚠️" : "";
        lines.push(`  • ${escapeHtml(absence.fullName!)} (${absence.studentNo}) – ${status}${absence.note ? `, ${escapeHtml(absence.note)}` : ""}${warn}`);
      } else {
        lines.push(`  • ❌ "${escapeHtml(absence.raw)}" – eşleşmedi, atlanacak`);
      }
    }
  }
  if (parsed?.notes) lines.push("", `Not: ${escapeHtml(parsed.notes)}`);
  lines.push("");
  if (!matched.classGroupId) {
    lines.push("Sınıf eşleşmediği için kayıt yapılamaz. Fişte sınıfı okunaklı yazıp yeniden gönderin.");
  } else {
    lines.push("Doğruysa <b>Onayla</b>'ya basın; işaretlenmeyen öğrenciler o derste var sayılır. ⚠️ işaretli eşleşmeleri kontrol edin. Yanlışsa fişi düzeltip yeniden gönderin.");
  }
  lines.push(`<i>Çözümleme ${Math.round(ms / 1000)} sn sürdü.</i>`);
  return lines.join("\n");
}

async function handleCallback(query: TelegramCallbackQuery) {
  const match = query.data?.match(/^slip:(\d+):(ok|no)$/);
  if (!match || !query.message) {
    await answerCallbackQuery(query.id);
    return;
  }
  const slipId = Number(match[1]);
  const chatId = String(query.message.chat.id);
  const slip = await prisma.attendanceSlip.findFirst({ where: { id: slipId, chatId } });
  if (!slip) {
    await answerCallbackQuery(query.id, "Fiş bulunamadı");
    return;
  }
  if (slip.status !== "PENDING") {
    await answerCallbackQuery(query.id, "Bu fiş zaten işlendi");
    return;
  }

  if (match[2] === "no") {
    await prisma.attendanceSlip.update({ where: { id: slipId }, data: { status: "CANCELLED" } });
    await answerCallbackQuery(query.id, "İptal edildi");
    await editMessageText(chatId, query.message.message_id, `${query.message.text ? escapeHtml(query.message.text.split("\n")[0]) : "Fiş"}\n\n❌ İptal edildi.`);
    return;
  }

  const actor = slip.userId ? { userId: slip.userId } : { teacherId: slip.teacherId! };
  const applied = await applySlip(slipId, actor);
  if ("error" in applied) {
    await answerCallbackQuery(query.id, "Kaydedilemedi");
    await sendMessage(chatId, `⚠️ ${escapeHtml(applied.error)}`);
    return;
  }
  const { matched, markedTotal } = applied;
  await answerCallbackQuery(query.id, "Kaydedildi");
  await editMessageText(
    chatId,
    query.message.message_id,
    `✅ <b>Yoklama kaydedildi</b>\n${escapeHtml(matched.className ?? "")} · ${formatDate(matched.date)} · ${matched.lessons.map((l) => `${l.lessonNo}. ders`).join(", ")}\n${markedTotal} devamsızlık kaydı işlendi.`,
  );
}
