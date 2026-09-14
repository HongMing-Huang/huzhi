"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBag, IconChat, IconFeed, IconMask, IconUser, IconUsers } from "@/components/Icons";
import { HuzhiLogo } from "@/components/HuzhiLogo";

const PRIMARY_NAV = [
  { href: "/", label: "社区", icon: IconFeed },
  { href: "/channels", label: "频道", icon: IconUsers },
  { href: "/match", label: "对局", icon: IconMask },
] as const;

const UTILITY_NAV = [
  { href: "/messages", label: "对局记录", icon: IconChat },
  { href: "/shop", label: "商店", icon: IconBag },
  { href: "/me", label: "我的", icon: IconUser },
] as const;

/** 移动底栏保留三个主入口与两个高频个人入口；商店从个人页进入。 */
const MOBILE_NAV = [PRIMARY_NAV[0], PRIMARY_NAV[1], PRIMARY_NAV[2], UTILITY_NAV[0], UTILITY_NAV[2]] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/post/");
  if (href === "/me") return pathname.startsWith("/me") || pathname.startsWith("/settings");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppHeader({ title, right }: { title?: string; right?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="shrink-0" aria-label="乎知首页"><HuzhiLogo className="h-7" /></Link>
        {title && <span className="truncate text-sm font-medium text-[color:var(--ink-2)] md:hidden">{title}</span>}
        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="全站导航">
          <div className="flex items-center gap-1" aria-label="主要功能">
            {PRIMARY_NAV.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="top-nav-link" data-active={isActive(pathname, href)}>
                <Icon size={16} />{label}
              </Link>
            ))}
          </div>
          <span className="mx-1 h-4 w-px bg-[color:var(--line)]" aria-hidden="true" />
          <div className="flex items-center gap-0.5" aria-label="个人功能">
            {UTILITY_NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="top-nav-link px-2.5"
                data-active={isActive(pathname, href)}
                aria-label={label}
                title={label}
              >
                <Icon size={17} /><span className="hidden xl:inline">{label}</span>
              </Link>
            ))}
          </div>
        </nav>
        {right && <div className="ml-auto shrink-0 md:ml-2">{right}</div>}
      </div>
    </header>
  );
}

export function MobileDock() {
  const pathname = usePathname();
  return (
    <nav className="mobile-dock md:hidden" aria-label="移动端主导航">
      {MOBILE_NAV.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} data-active={isActive(pathname, href)}>
          <Icon size={19} /><span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function PageFrame({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return <main className={`page-frame ${wide ? "page-frame-wide" : ""}`}>{children}</main>;
}
