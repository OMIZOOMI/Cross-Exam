import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./editorial.css";

export const metadata: Metadata = {
  title: { default: "CrossExam — Put your website on trial", template: "%s · CrossExam" },
  description:
    "Website intelligence that puts evidence first. Inspect real HTTP and HTML evidence, or explore the clearly labeled fixture investigation.",
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
