import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fromDbDate } from "@/lib/dates";
import BranchRow from "./BranchRow";
import TermRow from "./TermRow";
import YearRow from "./YearRow";

export default async function InstitutionsPage() {
  await requireAdmin();
  const [branches, academicYears] = await Promise.all([
    prisma.branch.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.academicYear.findMany({ orderBy: { startsOn: "desc" }, include: { terms: { orderBy: { startsOn: "asc" } } } }),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Kurumlar ve Yıllar</h1>
        <p className="text-sm text-gray-500">Bu tanımlar tüm idari projelerde ortak kullanılır.</p>
      </div>

      {(branches.length === 0 || academicYears.length === 0) && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Sistemi kullanmak için en az bir kurum ve bir eğitim-öğretim yılı tanımlayın.
        </p>
      )}

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Kurumlar</h2>
        {branches.map((branch) => (
          <BranchRow key={branch.id} branch={branch} />
        ))}
        <BranchRow key={`new-${branches.length}`} />
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Eğitim-öğretim yılları ve dönemler</h2>
          <p className="text-sm text-gray-500">Dönemler raporlarda tarih aralığı olarak seçilebilir.</p>
        </div>
        {academicYears.map((year) => (
          <div key={year.id} className="rounded-lg border border-gray-200">
            <YearRow
              year={{
                id: year.id,
                name: year.name,
                startsOn: fromDbDate(year.startsOn),
                endsOn: year.endsOn ? fromDbDate(year.endsOn) : "",
                isCurrent: year.isCurrent,
              }}
            />
            <div className="space-y-2 border-t border-gray-100 bg-gray-50 p-3">
              {year.terms.map((term) => (
                <TermRow
                  key={term.id}
                  academicYearId={year.id}
                  term={{
                    id: term.id,
                    name: term.name,
                    startsOn: fromDbDate(term.startsOn),
                    endsOn: term.endsOn ? fromDbDate(term.endsOn) : "",
                  }}
                />
              ))}
              <TermRow key={`new-${year.id}-${year.terms.length}`} academicYearId={year.id} />
            </div>
          </div>
        ))}
        <YearRow key={`new-${academicYears.length}`} />
      </section>
    </div>
  );
}
