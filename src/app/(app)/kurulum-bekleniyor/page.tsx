import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getContext } from "@/lib/context";

export default async function SetupPendingPage() {
  await requireUser();
  const { branch, academicYear } = await getContext();
  if (branch && academicYear) redirect("/");

  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <h1 className="mb-2 text-lg font-semibold">Kurulum bekleniyor</h1>
      <p className="text-sm text-gray-600">
        Henüz kurum veya eğitim-öğretim yılı tanımlanmamış. Yöneticinin tanımlamasından sonra sistemi kullanabilirsiniz.
      </p>
    </div>
  );
}
