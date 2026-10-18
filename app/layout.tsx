import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "鲍罗廷的秘书：三次抉择",
  description: "进入历史情境，共同作出选择。主持人带领、多人同步投票的文字游戏。",
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
