import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ReportView } from "../../../components/report-view";
import { compareScans } from "../../../lib/live-checks";
import { readReport } from "../../../lib/report-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ previous?: string | string[] }>;
};
const getReport = cache(readReport);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!(await getReport((await params).id))) notFound();
  return {
    title: "Live investigation",
    description: "A bounded local Veyra HTTP and HTML investigation.",
    robots: { index: false, follow: false },
  };
}

export default async function LiveReportPage({ params, searchParams }: Props) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) notFound();
  const { previous } = await searchParams;
  const prior = typeof previous === "string" && previous !== id ? await getReport(previous) : null;
  return (
    <ReportView
      key={id}
      report={report}
      comparison={prior ? compareScans(prior, report) : undefined}
    />
  );
}
