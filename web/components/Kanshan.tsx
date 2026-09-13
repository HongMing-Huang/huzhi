type KanshanVariant = "idle" | "stroll" | "wave";

interface KanshanProps {
  variant: KanshanVariant;
  size?: 64 | 80 | 96 | 128;
  alt?: string;
  decorative?: boolean;
  className?: string;
  eager?: boolean;
}

/**
 * 刘看山素材统一入口：保持原始 1:1 比例，不裁切、不拉伸。
 * 功能性出现必须传 alt；纯装饰使用 decorative，避免读屏重复品牌信息。
 */
export default function Kanshan({
  variant,
  size = 80,
  alt = "",
  decorative = false,
  className = "",
  eager = false,
}: KanshanProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/kanshan/${variant}.gif`}
      width={size}
      height={size}
      alt={decorative ? "" : alt}
      aria-hidden={decorative || undefined}
      loading={eager ? "eager" : "lazy"}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
