import type { Metadata } from "next";
import { ReportView } from "../../../components/report-view";
import { demoReport } from "../../../lib/demo-report";

export const metadata: Metadata = {
  title: "Demo case file",
  description:
    "A clearly labeled synthetic Veyra investigation with evidence, challenges, and limits.",
  robots: { index: false, follow: false },
};

export default function DemoReportPage() {
  return <ReportView report={demoReport} />;
}
