import Link from "next/link";
import { ReportView } from "@/components/report/ReportView";
import { PlayerNotFoundError } from "@/lib/report/build";
import type { Report } from "@/lib/report/types";
import { generateReport } from "@/lib/services";

export const maxDuration = 60;

export default async function PlayerPage({ params }: { params: Promise<{ cfbdId: string }> }) {
  const { cfbdId } = await params;
  let report: Report | null = null;
  let error: Error | null = null;
  try {
    report = await generateReport(cfbdId);
  } catch (e) {
    error = e as Error;
  }
  if (!report) {
    return (
      <div className="card space-y-3 p-6">
        <h1 className="text-xl font-semibold">{error instanceof PlayerNotFoundError ? "Player not found" : "Report failed"}</h1>
        <p className="text-sm text-muted">{error?.message}</p>
        <Link href="/" className="btn">
          Back to search
        </Link>
      </div>
    );
  }
  return (
    <>
      <title>{`${report.player.name} · CFB Prospect Report`}</title>
      <ReportView report={report} />
    </>
  );
}
