"use client";

import Kanshan from "./Kanshan";
import { kanshanSay, KANSHAN_HANDLE, KANSHAN_TITLE, type KanshanScene } from "@/lib/kanshan";

/**
 * 刘看山发言条：全站统一的"管理员说话"表现。
 *
 * 三种密度：
 *   inline  — 一行小字，用于结果反馈等紧凑位置
 *   card    — 带头像的卡片，用于侧栏与空状态
 *   banner  — 大一些的欢迎条，用于首屏引导
 */
export default function KanshanSays({
  scene,
  seed,
  variant: variantOverride,
  density = "card",
  className = "",
}: {
  scene: KanshanScene;
  seed?: string;
  variant?: "idle" | "stroll" | "wave";
  density?: "inline" | "card" | "banner";
  className?: string;
}) {
  const line = kanshanSay(scene, seed);
  const variant = variantOverride ?? line.variant;

  if (density === "inline") {
    return (
      <span className={`inline-flex items-center gap-1.5 text-[13px] text-[color:var(--meta)] ${className}`}>
        <Kanshan variant={variant} size={64} decorative className="!h-5 !w-5" />
        <span>{line.text}</span>
      </span>
    );
  }

  if (density === "banner") {
    return (
      <section className={`kanshan-banner ${className}`}>
        <Kanshan variant={variant} size={96} alt="刘看山向你打招呼" eager className="kanshan-banner-art" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] text-[color:var(--time)]">
            <b className="font-medium text-[color:var(--ink-2)]">{KANSHAN_HANDLE}</b>
            <span className="tag-pill !h-[20px] !px-1.5 !text-xs" data-tone="brand">{KANSHAN_TITLE}</span>
          </p>
          <p className="mt-1.5 text-[16px] leading-[26px] text-[color:var(--ink)]">{line.text}</p>
        </div>
      </section>
    );
  }

  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <Kanshan variant={variant} size={64} decorative className="!h-10 !w-10" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[13px] text-[color:var(--time)]">
          <b className="font-medium text-[color:var(--ink-2)]">{KANSHAN_HANDLE}</b>
          <span>· {KANSHAN_TITLE}</span>
        </p>
        <p className="mt-1 text-[14px] leading-[23px] text-[color:var(--meta)]">{line.text}</p>
      </div>
    </div>
  );
}
