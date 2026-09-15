import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PROJECT, getCurrentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const needsSetup = (await prisma.userProjectRole.count({ where: { project: PROJECT, role: "ADMIN" } })) === 0;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
            YN
          </div>
          <h1 className="text-lg font-semibold">Yeni Nesil Eğitim Kurumları</h1>
          <p className="text-sm text-gray-500">
            {needsSetup ? "Yoklama sistemi için ilk yönetici hesabını oluşturun" : "Yoklama sistemine giriş"}
          </p>
        </div>
        <LoginForm needsSetup={needsSetup} />
      </div>
    </main>
  );
}
