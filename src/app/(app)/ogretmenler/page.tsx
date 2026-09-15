import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { requireContext } from "@/lib/context";
import { getBotUsername } from "@/lib/botInfo";
import TeacherForm from "./TeacherForm";
import TelegramLink from "./TelegramLink";

export default async function TeachersPage() {
  await requireAdmin();
  const { branch } = await requireContext();
  const [teachers, botUsername] = await Promise.all([
    prisma.teacher.findMany({
      where: { branchId: branch.id },
      orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
      include: { telegramAccounts: { select: { username: true, fullName: true } } },
    }),
    getBotUsername(),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Öğretmenler</h1>
        <p className="text-sm text-gray-500">
          {branch.name} · Öğretmenler panele girmez; Telegram botuna yoklama fişi fotoğrafı göndererek yoklama işler.
        </p>
      </div>

      {!botUsername && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Telegram botu yapılandırılmamış (TELEGRAM_BOT_TOKEN). Bağlantı kodları oluşturulabilir ama bot yanıt vermez.
        </p>
      )}

      <section className="card space-y-4 p-5">
        {teachers.map((teacher) => (
          <div key={teacher.id} className={`space-y-1.5 border-b border-gray-100 pb-4 ${teacher.isActive ? "" : "opacity-60"}`}>
            <TeacherForm teacher={teacher} />
            <TelegramLink target={{ teacherId: teacher.id }} linked={teacher.telegramAccounts[0] ?? null} botUsername={botUsername} />
          </div>
        ))}
        {teachers.length === 0 && <p className="text-sm text-gray-500">Henüz öğretmen yok.</p>}
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-medium text-gray-600">Yeni öğretmen</p>
          <TeacherForm key={`new-${teachers.length}`} />
        </div>
      </section>
    </div>
  );
}
