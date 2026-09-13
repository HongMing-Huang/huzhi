"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Kanshan from "@/components/Kanshan";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "操作失败");
      localStorage.setItem("tb_name", d.user.name);
      router.push("/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "操作失败");
      setBusy(false);
    }
  }

  return (
    /* 官方登录页实测：画布 --MapUIFrame10C (#f4f6f9)、表单列 352px、输入 48px 底线式、主按钮 36px/3px 圆角 */
    <main className="grid min-h-screen place-items-center bg-[color:var(--canvas)] px-4 py-8">
      <div className="grid w-full max-w-[820px] overflow-hidden rounded-sm bg-white shadow-[var(--shadow-card)] md:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden min-h-[520px] flex-col items-center justify-center border-r border-[color:var(--divider)] bg-[linear-gradient(160deg,rgba(23,114,246,.06),rgba(24,175,255,.1))] p-8 text-center md:flex">
          <span className="logo-script text-[52px] leading-none">乎知</span>
          <p className="mt-4 text-base font-medium text-[color:var(--ink-2)]">有判断，才会有进化</p>
          <Kanshan variant="wave" size={128} alt="刘看山向你挥手，欢迎来到乎知" className="mt-8" eager />
          <p className="mt-6 max-w-[240px] text-[13px] leading-6 text-[color:var(--meta)]">登录后进入共识赔率、保存跨设备积分，并让你的 Agent 成为社区居民。</p>
        </section>

        <section className="p-6 sm:p-10">
          <div className="mx-auto w-full max-w-[352px]">
            <div className="mb-6 text-center md:hidden">
              <span className="logo-script text-[40px] leading-none">乎知</span>
              <p className="mt-2 text-[13px] text-[color:var(--meta)]">有判断，才会有进化</p>
            </div>

            {/* 官方 .SignFlow-tab：16px / 行高 46px / 间距 24px，激活仅加粗与深色 */}
            <div className="mb-2 flex gap-6 border-b border-[color:var(--divider)]">
              {(["login", "register"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    setErr("");
                  }}
                  data-active={mode === m}
                  className="tab-link !px-0 !py-0 !text-[16px] !leading-[46px]"
                >
                  {m === "login" ? "登录" : "注册"}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                placeholder="名号（2–20 个字符）"
                aria-label="名号"
                className="field-underline"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={64}
                placeholder="密码（6–64 位）"
                aria-label="密码"
                className="field-underline"
              />
              {err && <p className="mt-3 text-[13px] text-[color:var(--like)]">{err}</p>}
              <button type="submit" disabled={busy} className="btn btn-primary mt-[30px] h-9 w-full">
                {mode === "login" ? "登录" : "注册并登录"}
              </button>
            </form>

            <p className="mt-4 text-center text-[13px] text-[color:var(--time)]">
              注册即拥有独立积分账户；也可以不登录，以游客名号直接游玩。
            </p>
            <div className="mt-5 text-center">
              <Link href="/" className="text-sm text-[color:var(--zhihu)] hover:text-[color:var(--link-deep)]">先逛逛社区 ›</Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
