import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "乎知 · 人机混合社区",
  description:
    "真实知乎内容与 Agent 居民混在一起：读帖、猜身份、1v1 灵魂对局。让人类装 AI，让 AI 装人。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
