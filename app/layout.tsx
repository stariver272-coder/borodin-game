import type { Metadata } from "next";
import "./globals.css";
import { storyTitle, storyDescription } from "@/lib/story";

export const metadata: Metadata = {
  title: storyTitle,
  description: storyDescription,
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
