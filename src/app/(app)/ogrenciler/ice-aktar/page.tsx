import Link from "next/link";
import { requireContext } from "@/lib/context";
import ImportForm from "./ImportForm";

export default async function ImportPage() {
  const { branch, academicYear } = await requireContext();

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link href="/ogrenciler" className="text-sm text-gray-500 hover:text-indigo-600">← Öğrenciler</Link>
        <h1 className="text-2xl font-semibold">Excel&apos;den öğrenci aktar</h1>
        <p className="text-sm text-gray-500">
          Aktarım <strong>{branch.name}</strong> · <strong>{academicYear.name}</strong> için yapılır.
        </p>
      </div>

      <div className="card space-y-2 p-5 text-sm text-gray-700">
        <p>
          K12&apos;den alınan <strong>Öğrenci Bilgilerini Güncelle</strong> Excel dosyasını olduğu gibi yükleyin.
        </p>
        <ul className="list-inside list-disc space-y-1 text-gray-600">
          <li>Öğrenci TC kimlik no ile eşleşir; varsa güncellenir, yoksa eklenir.</li>
          <li>Şube (örn. &quot;Mezun/F5&quot;) yoksa otomatik oluşturulur. Şubesi boş satırlar aktarılmaz.</li>
          <li>Anne ve baba bilgileri veli olarak eklenir; aynı TC&apos;li veli kardeşlerde tek kayıt olur.</li>
          <li>Şifre, adres ve diğer bilgiler aktarılmaz.</li>
        </ul>
      </div>

      <div className="card p-5">
        <ImportForm />
      </div>
    </div>
  );
}
