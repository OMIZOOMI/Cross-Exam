import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ReportView } from "../../../components/report-view";
import { readReport } from "../../../lib/report-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
const getReport = cache(readReport);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!(await getReport((await params).id))) notFound();
  return { title: "Live investigation", robots: { index: false, follow: false } };
}

export default async function LiveReportPage({ params }: Props) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) notFound();
  return <ReportView report={report} />;
}
