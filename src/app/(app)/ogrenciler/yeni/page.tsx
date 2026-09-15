import Link from "next/link";
import { requireContext } from "@/lib/context";
import { getClassGroupOptions } from "@/lib/reports";
import StudentForm from "../StudentForm";

export default async function NewStudentPage() {
  const { branch, academicYear } = await requireContext();
  const classGroups = await getClassGroupOptions(branch.id, academicYear.id);

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link href="/ogrenciler" className="text-sm text-gray-500 hover:text-indigo-600">← Öğrenciler</Link>
        <h1 className="text-2xl font-semibold">Yeni öğrenci</h1>
        <p className="text-sm text-gray-500">{branch.name} · {academicYear.name}</p>
      </div>
      <div className="card p-5">
        <StudentForm classGroups={classGroups} />
      </div>
    </div>
  );
}
