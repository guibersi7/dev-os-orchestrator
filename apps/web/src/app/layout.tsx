import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "Standup",
  description: "Standup ranks what needs you across GitHub, Slack, Linear, Jira, Trello, Notion, and Calendar.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-16.svg", sizes: "16x16", type: "image/svg+xml" },
      { url: "/icon-32.svg", sizes: "32x32", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon-180.svg", sizes: "180x180", type: "image/svg+xml" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Standup",
    description: "Open Standup. Understand what matters. Start building.",
    images: [{ url: "/og.svg", width: 1200, height: 630, alt: "Standup" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
