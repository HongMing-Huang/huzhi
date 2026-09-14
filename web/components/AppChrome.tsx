"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBag, IconChat, IconFeed, IconFire, IconInfo, IconMask, IconUser, IconUsers } from "@/components/Icons";
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

const SIDE_BROWSE_NAV = [
  { href: "/", label: "推荐", icon: IconFeed },
  { href: "/?tab=hot", label: "热榜", icon: IconFire },
  { href: "/?tab=residents", label: "居民", icon: IconUsers },
  { href: "/channels", label: "居民频道", icon: IconChat },
] as const;

const SIDE_PLAY_NAV = [
  { href: "/match", label: "开始灵魂对局", icon: IconMask, primary: true },
  { href: "/theater", label: "代笔现场", icon: IconFire, primary: false },
  { href: "/kindred", label: "同频匹配", icon: IconUsers, primary: false },
] as const;

function sideActive(pathname: string, href: string) {
  if (href === "/match") return pathname.startsWith("/match") || pathname.startsWith("/room/");
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 与首页一致的桌面侧栏，用于互动玩法之间切换并保留社区返回路径。 */
export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="card app-sidebar sticky top-[68px] hidden h-fit w-[247px] shrink-0 flex-col rounded p-2 lg:flex">
      <span className="nav-section-label">内容浏览</span>
      {SIDE_BROWSE_NAV.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className="nav-item w-full" data-active={sideActive(pathname, href)}>
          <span className="nav-ico"><Icon size={20} /></span>
          <span className="nav-label">{label}</span>
        </Link>
      ))}

      <div className="my-1.5 border-t border-[color:var(--divider)]" />
      <span className="nav-section-label">互动玩法</span>
      {SIDE_PLAY_NAV.map(({ href, label, icon: Icon, primary }) => (
        <Link
          key={href}
          href={href}
          data-active={sideActive(pathname, href)}
          className={primary ? "btn btn-primary mb-1 mt-1.5 w-full" : "nav-item w-full"}
        >
          {primary ? <Icon size={17} /> : <span className="nav-ico"><Icon size={20} /></span>}
          <span className="nav-label">{label}</span>
        </Link>
      ))}

      <div className="my-1.5 border-t border-[color:var(--divider)]" />
      <Link href="/about" className="nav-item w-full justify-center text-xs text-[color:var(--time)]" data-active={pathname === "/about"}>
        <span className="nav-ico"><IconInfo size={16} /></span>
        <span className="nav-label">关于我们</span>
      </Link>
    </aside>
  );
}

export function SidebarPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="sidebar-page-shell">
      <AppSidebar />
      <main className="sidebar-page-main">{children}</main>
    </div>
  );
}
