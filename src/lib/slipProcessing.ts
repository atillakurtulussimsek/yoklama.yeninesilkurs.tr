import "server-only";
import { prisma } from "@/lib/db";
import { analyzeSlipImage, type ParsedSlip } from "@/lib/ai";
import { applyAttendance, type AttendanceEntry } from "@/lib/attendance";
import { classLabel, compareClassGroups, fullName } from "@/lib/classGroups";
import { formatDate, fromDbDate, isDateStr, parseTrDate, toDbDate, todayStr } from "@/lib/dates";
import { STATUS_LABELS } from "@/lib/labels";
import { matchAbsences, matchClassGroup, type MatchedLesson, type MatchResult } from "@/lib/slipMatching";
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
    data: { branchId, academicYearId: academicYear.id, chatId, userId: account.userId, teacherId: account.teacherId, telegramFileId: fileId },
  });

  const fail = async (error: string) => {
    console.error(`Fiş #${slip.id} başarısız:`, error);
    await prisma.attendanceSlip.update({ where: { id: slip.id }, data: { status: "FAILED", errorMessage: error.slice(0, 500) } });
    await sendMessage(chatId, `⚠️ ${escapeHtml(error)}`);
  };

  const imagePromise = downloadFile(fileId).then(
    (image) => ({ image }),
    (error: unknown) => ({ error: error instanceof Error ? error.message : "Görsel indirilemedi" }),
  );
  const [groups, enrollments] = await Promise.all([
    prisma.classGroup.findMany({ where: { branchId, academicYearId: academicYear.id, isActive: true } }),
    prisma.studentEnrollment.findMany({
      where: { branchId, academicYearId: academicYear.id, status: "ACTIVE" },
      select: {
        id: true,
        studentNo: true,
        classGroupId: true,
        classGroup: { select: { gradeLevel: true, name: true } },
        student: { select: { firstName: true, lastName: true } },
      },
    }),
    sendMessage(chatId, "Fiş alındı, çözümleniyor..."),
    sendChatAction(chatId),
  ]);

  const downloaded = await imagePromise;
  if ("error" in downloaded) return fail(downloaded.error);
  const { image } = downloaded;

  const analysis = await analyzeSlipImage({
    branchId,
    imageBase64: image.base64,
    mime: image.mime,
    classLabels: groups.sort(compareClassGroups).map(classLabel),
  });
  if ("error" in analysis) return fail(analysis.error);
  const parsed = analysis.parsed;

  // Açıklama metninde tarih belirtilmişse fişteki tarihi geçersiz kılar (örn. "12.09.2026")
  const captionDate = caption?.match(/(\d{1,2}[./]\d{1,2}[./]\d{4})/)?.[1];
  const classGroupId = matchClassGroup(parsed.className, groups);
  const date = resolveDate(captionDate ?? parsed.date);
  const group = groups.find((item) => item.id === classGroupId);
  const candidates = enrollments.map((enrollment) => ({
    enrollmentId: enrollment.id,
    studentNo: enrollment.studentNo,
    fullName: fullName(enrollment.student),
    classGroupId: enrollment.classGroupId,
    className: classLabel(enrollment.classGroup),
  }));

  // Fişteki ders numaraları için tanımlı ders yoksa "N. Ders" olarak oluşturulur
  const lessonNos = [...new Set(parsed.lessons.map((lesson) => lesson.lessonNo))].sort((a, b) => a - b);
  const periods = await ensureLessonPeriods(branchId, lessonNos);

  const lessons: MatchedLesson[] = parsed.lessons
    .filter((lesson, index, all) => all.findIndex((item) => item.lessonNo === lesson.lessonNo) === index)
    .sort((a, b) => a.lessonNo - b.lessonNo)
    .map((lesson) => {
      const period = periods.get(lesson.lessonNo)!;
      return {
        lessonNo: lesson.lessonNo,
        subject: lesson.subject,
        slot: period.id,
        lessonName: period.name,
        full: lesson.full || lesson.absences.length === 0,
        absences: matchAbsences(lesson.absences, candidates, classGroupId),
      };
    });

  const matched: MatchResult = { classGroupId, className: group ? classLabel(group) : null, date, lessons };

  const text = buildPreview(parsed, matched, analysis.ms);
  const keyboard = matched.classGroupId && lessons.length
    ? [
        [
          { text: "✅ Onayla ve kaydet", callback_data: `slip:${slip.id}:ok` },
          { text: "❌ İptal", callback_data: `slip:${slip.id}:no` },
        ],
      ]
    : [[{ text: "❌ Kapat", callback_data: `slip:${slip.id}:no` }]];
  const preview = await sendMessage(chatId, text, keyboard);
  await prisma.attendanceSlip.update({
    where: { id: slip.id },
    data: { parsed, matched, previewMessageId: preview.message_id, analysisMs: analysis.ms, totalMs: Date.now() - slip.createdAt.getTime() },
  });
}

async function ensureLessonPeriods(branchId: number, lessonNos: number[]) {
  const existing = await prisma.lessonPeriod.findMany({ where: { branchId, orderNo: { in: lessonNos } } });
  const map = new Map(existing.filter((p) => p.isActive).map((p) => [p.orderNo, p]));
  for (const period of existing) if (!map.has(period.orderNo)) map.set(period.orderNo, period);
  for (const lessonNo of lessonNos) {
    if (map.has(lessonNo)) continue;
    const created = await prisma.lessonPeriod.create({
      data: { branchId, orderNo: lessonNo, name: `${lessonNo}. Ders`, session: lessonNo >= 5 ? "AFTERNOON" : "MORNING" },
    });
    map.set(lessonNo, created);
  }
  return map;
}

function resolveDate(value: string | null) {
  if (!value) return todayStr();
  if (isDateStr(value)) return value;
  const parsed = parseTrDate(value);
  return parsed ? fromDbDate(parsed) : todayStr();
}

function buildPreview(parsed: ParsedSlip, matched: MatchResult, ms: number) {
  const lines: string[] = ["<b>Yoklama fişi çözümlendi</b>", ""];
  lines.push(`Sınıf: <b>${matched.className ? escapeHtml(matched.className) : `⚠️ bulunamadı (${escapeHtml(parsed.className ?? "-")})`}</b>`);
  lines.push(`Tarih: <b>${formatDate(matched.date)}</b>${parsed.date ? "" : " (fişte okunamadı, bugün alındı)"}`);
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
  if (parsed.notes) lines.push("", `Not: ${escapeHtml(parsed.notes)}`);
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

  const matched = slip.matched as MatchResult | null;
  if (!matched || !matched.classGroupId || matched.lessons.length === 0) {
    await answerCallbackQuery(query.id, "Kaydedilecek veri yok");
    return;
  }

  const classmates = await prisma.studentEnrollment.findMany({
    where: { classGroupId: matched.classGroupId, status: "ACTIVE" },
    select: { id: true },
  });
  const actor = slip.userId ? { userId: slip.userId } : { teacherId: slip.teacherId! };
  let markedTotal = 0;

  for (const lesson of matched.lessons) {
    const marked: AttendanceEntry[] = lesson.absences
      .filter((absence) => absence.enrollmentId)
      .map((absence) => ({ enrollmentId: absence.enrollmentId!, status: absence.status, note: absence.note ?? undefined }));
    const markedIds = new Set(marked.map((entry) => entry.enrollmentId));
    // Sınıfın diğer öğrencileri o derste var sayılır
    const present: AttendanceEntry[] = classmates.filter((c) => !markedIds.has(c.id)).map((c) => ({ enrollmentId: c.id, status: null }));

    const result = await applyAttendance({
      branchId: slip.branchId,
      academicYearId: slip.academicYearId,
      date: toDbDate(matched.date),
      slot: lesson.slot,
      entries: [...marked, ...present],
      actor,
    });
    if ("error" in result) {
      const error = result.error ?? "Bilinmeyen hata";
      await prisma.attendanceSlip.update({ where: { id: slipId }, data: { status: "FAILED", errorMessage: error } });
      await answerCallbackQuery(query.id, "Hata oluştu");
      await sendMessage(chatId, `⚠️ ${lesson.lessonNo}. ders kaydedilemedi: ${escapeHtml(error)}`);
      return;
    }
    markedTotal += result.markedCount;
  }

  await prisma.attendanceSlip.update({ where: { id: slipId }, data: { status: "APPLIED", appliedAt: new Date() } });
  await answerCallbackQuery(query.id, "Kaydedildi");
  await editMessageText(
    chatId,
    query.message.message_id,
    `✅ <b>Yoklama kaydedildi</b>\n${escapeHtml(matched.className ?? "")} · ${formatDate(matched.date)} · ${matched.lessons.map((l) => `${l.lessonNo}. ders`).join(", ")}\n${markedTotal} devamsızlık kaydı işlendi.`,
  );
}
