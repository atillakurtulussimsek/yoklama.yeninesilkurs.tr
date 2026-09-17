import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/context";
import { fullName } from "@/lib/classGroups";
import { formatDateTime, todayStr } from "@/lib/dates";
import { getClassGroupOptions } from "@/lib/reports";
import type { MatchResult } from "@/lib/slipMatching";
import type { ParsedSlip } from "@/lib/ai";
import type { SlipStatus } from "@/generated/prisma/enums";
import AutoRefresh from "./AutoRefresh";
import SlipCard, { type SlipView } from "./SlipCard";
import UploadForm from "./UploadForm";

const FILTERS: { key: string; label: string; statuses: SlipStatus[] }[] = [
  { key: "bekleyen", label: "Bekleyen", statuses: ["ANALYZING", "PENDING", "FAILED"] },
  { key: "kaydedilen", label: "Kaydedilen", statuses: ["APPLIED"] },
  { key: "reddedilen", label: "Reddedilen", statuses: ["CANCELLED"] },
  { key: "tumu", label: "Tümü", statuses: ["ANALYZING", "PENDING", "FAILED", "APPLIED", "CANCELLED"] },
];

export default async function SlipsPage({ searchParams }: PageProps<"/yoklama-fisleri">) {
  const { user, branch, academicYear } = await requireContext();
  const params = await searchParams;
  const filter = FILTERS.find((item) => item.key === params.filtre) ?? FILTERS[0];

  const [slips, classGroups, counts] = await Promise.all([
    prisma.attendanceSlip.findMany({
      where: { branchId: branch.id, academicYearId: academicYear.id, status: { in: filter.statuses } },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        status: true,
        source: true,
        fileName: true,
        createdAt: true,
        analysisMs: true,
        errorMessage: true,
        matched: true,
        parsed: true,
        imageMime: true,
        telegramFileId: true,
        user: { select: { fullName: true } },
        teacher: { select: { firstName: true, lastName: true } },
      },
    }),
    getClassGroupOptions(branch.id, academicYear.id),
    prisma.attendanceSlip.groupBy({ by: ["status"], where: { branchId: branch.id, academicYearId: academicYear.id }, _count: { _all: true } }),
  ]);
  const countOf = (statuses: SlipStatus[]) => counts.filter((c) => statuses.includes(c.status)).reduce((s, c) => s + c._count._all, 0);
  const analyzing = slips.some((slip) => slip.status === "ANALYZING");

  const views: SlipView[] = slips.map((slip) => {
    const raw = slip.matched as Partial<MatchResult> | null;
    return {
      id: slip.id,
      status: slip.status,
      source: slip.source,
      fileName: slip.fileName,
      createdAt: formatDateTime(slip.createdAt),
      submitter: slip.user?.fullName ?? (slip.teacher ? `${fullName(slip.teacher)} (öğretmen)` : "-"),
      analysisMs: slip.analysisMs,
      errorMessage: slip.errorMessage,
      matched: raw && Array.isArray(raw.lessons) ? (raw as MatchResult) : null,
      parsedClassName: (slip.parsed as ParsedSlip | null)?.className ?? null,
      hasImage: Boolean(slip.imageMime || slip.telegramFileId),
    };
  });

  return (
    <div className="space-y-5">
      <AutoRefresh active={analyzing} />
      <div>
        <h1 className="text-2xl font-semibold">Yoklama Fişleri</h1>
        <p className="text-sm text-gray-500">
          {branch.name} · Fiş görsellerini yükleyin veya Telegram&apos;dan gönderin; yapay zeka okur, siz onaylarsınız.
        </p>
      </div>

      <UploadForm today={todayStr()} />

      <div className="flex flex-wrap gap-1 rounded-lg border border-gray-300 bg-white p-0.5 text-sm w-fit">
        {FILTERS.map((item) => (
          <a
            key={item.key}
            href={`/yoklama-fisleri?filtre=${item.key}`}
            className={`rounded-md px-3 py-1.5 ${item.key === filter.key ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
          >
            {item.label} ({countOf(item.statuses)})
          </a>
        ))}
      </div>

      {views.length === 0 ? (
        <div className="card p-8 text-center text-sm text-gray-500">Bu filtrede fiş yok.</div>
      ) : (
        <div className="space-y-3">
          {views.map((slip) => (
            <SlipCard key={slip.id} slip={slip} classGroups={classGroups} isAdmin={user.role === "ADMIN"} />
          ))}
        </div>
      )}
    </div>
  );
}
