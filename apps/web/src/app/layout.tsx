import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./editorial.css";
import "./landing-stage18.css";
import "./landing-stage181.css";
import "./report-stage18.css";

export const metadata: Metadata = {
  title: {
    default: "Veyra — Evidence-backed website investigations",
    template: "%s · Veyra",
  },
  description:
    "Evidence-backed website investigations. Inspect bounded HTTP and HTML evidence, challenge conclusions, and keep uncertainty visible.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
