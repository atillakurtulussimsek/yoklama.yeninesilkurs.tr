import { prisma } from "@/lib/db";
import { PROJECT, ROLE_LABELS, requireAdmin, type ProjectRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { getBotUsername } from "@/lib/botInfo";
import TelegramLink from "@/app/(app)/ogretmenler/TelegramLink";
import UserCreateForm from "./UserCreateForm";
import UserRowActions from "./UserRowActions";

export default async function UsersPage() {
  const admin = await requireAdmin();
  const [roles, botUsername] = await Promise.all([
    prisma.userProjectRole.findMany({
      where: { project: PROJECT },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            isActive: true,
            lastLoginAt: true,
            telegramAccounts: { select: { username: true, fullName: true } },
          },
        },
      },
    }),
    getBotUsername(),
  ]);
  roles.sort((a, b) => a.user.fullName.localeCompare(b.user.fullName, "tr-TR"));

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Kullanıcılar</h1>

      <section className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Ad Soyad</th>
              <th>Kullanıcı adı</th>
              <th>Yetki</th>
              <th>Son giriş</th>
              <th>Telegram</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {roles.map(({ user, role }) => (
              <tr key={user.id} className={user.isActive ? undefined : "opacity-50"}>
                <td className="font-medium">
                  {user.fullName}
                  {!user.isActive && <span className="badge ml-2 bg-gray-100 text-gray-600 ring-gray-200">Pasif hesap</span>}
                </td>
                <td>{user.username}</td>
                <td>{ROLE_LABELS[role as ProjectRole] ?? role}</td>
                <td className="whitespace-nowrap text-gray-500">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "-"}</td>
                <td>
                  <TelegramLink target={{ userId: user.id }} linked={user.telegramAccounts[0] ?? null} botUsername={botUsername} />
                </td>
                <td>
                  <UserRowActions user={{ id: user.id, fullName: user.fullName, role: role as ProjectRole }} isSelf={user.id === admin.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 font-semibold">Kullanıcı ekle</h2>
        <p className="mb-4 text-sm text-gray-500">
          Hesaplar tüm idari projelerde ortaktır. Kullanıcı adı başka projede varsa şifre boş bırakılır, yalnızca yoklama
          yetkisi verilir. Görevli: yoklama, veli bilgilendirme, öğrenci ve raporlar. Yönetici: ek olarak ayarlar ve kullanıcılar.
        </p>
        <UserCreateForm />
      </section>
    </div>
  );
}
