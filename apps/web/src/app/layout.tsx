import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Developer OS",
  description: "Engineering intelligence for focus, integrations, WorkEvents, summaries, and workspace chat.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
