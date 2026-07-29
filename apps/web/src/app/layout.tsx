import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Developer OS",
  description: "A GitHub-first intelligence layer for software engineers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
