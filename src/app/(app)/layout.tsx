import { ROLE_LABELS, requireUser } from "@/lib/auth";
import { getContext } from "@/lib/context";
import { logout } from "@/app/giris/actions";
import ContextSwitcher from "./ContextSwitcher";
import NavLinks from "./NavLinks";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const { branches, academicYears, branch, academicYear } = await getContext();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-gray-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            YN
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Yeni Nesil</div>
            <div className="text-xs text-gray-500">Yoklama Sistemi</div>
          </div>
        </div>
        {branch && academicYear && (
          <ContextSwitcher
            branches={branches.map(({ id, name }) => ({ id, name }))}
            academicYears={academicYears.map(({ id, name }) => ({ id, name }))}
            branchId={branch.id}
            academicYearId={academicYear.id}
          />
        )}
        <NavLinks isAdmin={user.role === "ADMIN"} />
        <div className="hidden border-t border-gray-100 px-4 py-3 md:block">
          <div className="text-sm font-medium">{user.fullName}</div>
          <div className="mb-2 text-xs text-gray-500">{ROLE_LABELS[user.role]}</div>
          <form action={logout}>
            <button className="text-xs text-gray-500 hover:text-red-600">Çıkış yap</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
