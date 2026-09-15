import "server-only";
import OpenAI from "openai";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "@/lib/db";

const absenceSchema = z.object({
  studentNo: z.coerce.number().int().nullable().catch(null),
  name: z.string().nullable().catch(null),
  status: z.enum(["ABSENT", "LATE", "EARLY_LEAVE", "EXCUSED"]).catch("ABSENT"),
  note: z.string().max(80).nullable().catch(null),
});

export const parsedSlipSchema = z.object({
  className: z.string().nullable().catch(null),
  date: z.string().nullable().catch(null),
  lessons: z
    .array(
      z.object({
        lessonNo: z.coerce.number().int().min(1).max(20),
        subject: z.string().nullable().catch(null),
        full: z.boolean().catch(false),
        absences: z.array(absenceSchema).catch([]),
      }),
    )
    .catch([]),
  notes: z.string().nullable().catch(null),
});

export type ParsedSlip = z.infer<typeof parsedSlipSchema>;
export type ParsedAbsence = z.infer<typeof absenceSchema>;

export async function getAiSettings(branchId: number) {
  return prisma.branchAiSetting.findUnique({ where: { branchId } });
}

const SYSTEM_PROMPT = `Sen bir kurs merkezinin "Öğrenci Günlük Yoklama Fişi" belgesini okuyan asistansın.
Fişin yapısı: Üstte sınıf/şube ve tarih. Ortada her sütun bir ders saatidir (1. DERS, 2. DERS, ... 10. DERS). Sütunun üstünde dersin adı (Fizik, Kimya, Türkçe...) yazılıdır. Sütun içine o derse GELMEYEN öğrencilerin okul numaraları alt alta yazılır. "Tam" yazıyorsa o derste herkes vardır (devamsız yok). Numaranın yanında/önünde "Geç" veya "G" yazıyorsa o öğrenci geç gelmiştir. Boş sütunlar (ders adı yazılmamış) o gün işlenmemiş derslerdir, onları listeleme.

YALNIZCA şu JSON'u döndür, açıklama yazma:
{
  "className": "sınıf/şube adı, yoksa null",
  "date": "tarih GG.AA.YYYY, yoksa null",
  "lessons": [
    {
      "lessonNo": 1,
      "subject": "ders adı veya null",
      "full": true,
      "absences": [ { "studentNo": 729, "name": null, "status": "ABSENT", "note": null } ]
    }
  ],
  "notes": "başka önemli not, yoksa null"
}
Kurallar:
- Yalnızca ders adı yazılı (işlenmiş) sütunları listele.
- full: "Tam" yazılmışsa veya ders işlenmiş ama hiç numara yoksa true, aksi halde false.
- status değerleri: ABSENT, LATE, EARLY_LEAVE, EXCUSED. Ok işareti "→" ile bir numaraya bağlanan "Geç" o numaranın LATE olduğunu gösterir; "erken çıktı", "çıkış" EARLY_LEAVE; "raporlu", "izinli", "mazeretli" EXCUSED; diğerleri ABSENT.
- İsim yazılmışsa name alanına, numara yazılmışsa studentNo alanına yaz. Numaraları dikkatle oku, uydurma.
- note: yalnızca fişte o öğrencinin yanına yazılmış kısa açıklama (örn. "raporlu"). Durumu tekrar etme, okuma yorumu yazma; yoksa null.
- notes: fişle ilgili genel bir uyarı gerekiyorsa tek kısa cümle, yoksa null.`;

/** Görseli küçültür (uzun kenar 1280px, JPEG %80): daha az token, daha hızlı yanıt. */
export async function prepareImage(base64: string) {
  try {
    const buffer = await sharp(Buffer.from(base64, "base64"))
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return { base64: buffer.toString("base64"), mime: "image/jpeg" };
  } catch {
    return null;
  }
}

/** Görseli kurumun AI ayarlarıyla çözümler. */
export async function analyzeSlipImage(options: {
  branchId: number;
  imageBase64: string;
  mime: string;
  classLabels: string[];
}): Promise<{ parsed: ParsedSlip; ms: number } | { error: string }> {
  const settings = await getAiSettings(options.branchId);
  if (!settings) return { error: "Bu kurum için yapay zeka ayarları tanımlanmamış. Yönetici panelinden Yoklama Ayarları → Yapay Zeka bölümünü doldurun." };

  const client = new OpenAI({ apiKey: settings.apiKey, baseURL: settings.baseUrl, timeout: 180_000, maxRetries: 1 });
  const context = options.classLabels.length
    ? `Kurumdaki şubeler: ${options.classLabels.join(", ")}. className bunlardan birine en yakın olanı olsun.`
    : "";

  const image = (await prepareImage(options.imageBase64)) ?? { base64: options.imageBase64, mime: options.mime };
  const request = {
    model: settings.model,
    temperature: 0,
    max_completion_tokens: 2000,
    messages: [
      { role: "system" as const, content: SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: `${context}\nBu yoklama fişini çözümle.` },
          { type: "image_url" as const, image_url: { url: `data:${image.mime};base64,${image.base64}`, detail: "auto" as const } },
        ],
      },
    ],
  };

  const started = Date.now();
  let content = "";
  try {
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      // Akıl yürüten modellerde düşük çaba = çok daha hızlı yanıt; desteklemeyen sağlayıcıda parametresiz dene
      completion = await client.chat.completions.create({ ...request, reasoning_effort: "low" });
    } catch (error) {
      if (error instanceof OpenAI.APIError && error.status === 400) {
        completion = await client.chat.completions.create(request);
      } else {
        throw error;
      }
    }
    content = completion.choices[0]?.message?.content ?? "";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("AI isteği başarısız:", message);
    return { error: `Yapay zeka isteği başarısız: ${message.slice(0, 200)}` };
  }

  const json = extractJson(content);
  if (!json) {
    console.error("AI yanıtı JSON değil:", content.slice(0, 500));
    return { error: "Yapay zeka yanıtı çözümlenemedi" };
  }
  const parsed = parsedSlipSchema.safeParse(json);
  if (!parsed.success) {
    console.error("AI yanıtı şemaya uymuyor:", parsed.error.issues[0], content.slice(0, 500));
    return { error: "Yapay zeka yanıtı beklenen biçimde değil" };
  }
  return { parsed: parsed.data, ms: Date.now() - started };
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}
