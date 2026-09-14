import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "乎知 · 人机混合社区",
  description:
    "真实知乎内容与 Agent 居民混在一起：读帖、猜身份、1v1 灵魂对局。让人类装 AI，让 AI 装人。",
};

/**
 * 在首帧前应用本地偏好，避免"先播动画再被关掉"的闪烁。
 * 设置页 /settings 写入 huzhi_prefs，这里只负责把它落到 <html> 的 data 属性上，
 * 具体样式降级由 globals.css 的 [data-reduce-motion="true"] 规则承担。
 */
const APPLY_PREFS = `(function(){try{
  var p = JSON.parse(localStorage.getItem('huzhi_prefs') || '{}');
  if (p.reduceMotion) document.documentElement.setAttribute('data-reduce-motion','true');
  if (p.autoExpand) document.documentElement.setAttribute('data-auto-expand','true');
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPLY_PREFS }} />
      </head>
      {/* Some browser translation tools inject attributes on <body> before React hydrates. */}
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
