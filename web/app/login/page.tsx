"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center justify-center">
        <span className="logo-script text-[40px] leading-none text-[color:var(--zhihu)]">乎知</span>
      </div>

      <div className="card p-6 sm:p-8">
        <div className="mb-5 flex gap-1 border-b border-[color:var(--line)]">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setErr("");
              }}
              className={`relative px-4 py-2.5 text-[15px] font-medium ${
                mode === m ? "text-[color:var(--zhihu)]" : "text-[color:var(--muted)]"
              }`}
            >
              {m === "login" ? "登录" : "注册"}
              {mode === m && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[color:var(--zhihu)]" />}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          <div>
            <label className="text-sm font-medium">名号</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="2–20 个字符"
              className="mt-1.5 w-full rounded border border-[color:var(--line)] px-3 py-2.5 text-sm outline-none focus:border-[color:var(--zhihu)]"
            />
          </div>
          <div>
            <label className="text-sm font-medium">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={64}
              placeholder="6–64 位"
              className="mt-1.5 w-full rounded border border-[color:var(--line)] px-3 py-2.5 text-sm outline-none focus:border-[color:var(--zhihu)]"
            />
          </div>
          {err && <p className="text-sm text-[color:var(--danger)]">{err}</p>}
          <button type="submit" disabled={busy} className="btn btn-primary w-full py-2.5">
            {mode === "login" ? "登录" : "注册并登录"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-[color:var(--muted)]">
          注册即拥有独立积分账户；也可以不登录，以游客名号直接游玩。
        </p>
      </div>

      <div className="mt-5 text-center">
        <Link href="/" className="text-sm text-[color:var(--zhihu)]">先逛逛社区 ›</Link>
      </div>
    </main>
  );
}
