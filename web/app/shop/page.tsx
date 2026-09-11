"use client";

// 积分商店：积分的「使用」出口。道具真实可用——
// 透视镜：在帖子详情页直接查看身份判定与理由；双倍卡：装填后下一次猜帖积分 ×2。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IconEye, IconBolt } from "@/components/Icons";

interface Items {
  xray?: { name: string; price: number; desc: string };
  double?: { name: string; price: number; desc: string };
}

export default function ShopPage() {
  const [state, setState] = useState<{ items: Items; inventory: Record<string, number>; bank: number } | null>(null);
  const [unauth, setUnauth] = useState(false);
  const [msg, setMsg] = useState("");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/shop");
    if (res.status === 401) {
      setUnauth(true);
      return;
    }
    const d = await res.json();
    setState(d);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(action: string, item?: string) {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, item }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "操作失败");
      setState((prev) => (prev ? { ...prev, bank: d.bank ?? prev.bank, inventory: d.inventory ?? prev.inventory } : prev));
      setMsg(action === "buy" ? "购买成功！" : "双倍卡已装填：下一次猜帖积分 ×2");
      if (d.armed) setArmed(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[color:var(--line)] bg-white">
        <div className="mx-auto flex h-14 max-w-[760px] items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="logo-script text-[26px] leading-none">乎知</span>
            
          </Link>
          <span className="text-sm text-[color:var(--muted)]">积分商店</span>
          {state && <span className="ml-auto text-sm">积分 <b className="tnum text-[color:var(--gold)]">{state.bank}</b></span>}
        </div>
      </header>

      <main className="mx-auto max-w-[760px] space-y-3 px-4 py-5">
        {unauth && (
          <div className="card p-10 text-center">
            <p className="text-sm text-[color:var(--muted)]">商店需要登录（道具绑定账户，跨设备可用）。</p>
            <Link href="/login" className="btn btn-primary mt-4 inline-block px-6 py-2.5 text-sm">去登录 / 注册</Link>
          </div>
        )}
        {!unauth && !state && <p className="card p-8 text-center text-sm text-[color:var(--muted)]">商店装载中…</p>}
        {state && (
          <>
            {msg && <p className="card px-4 py-2.5 text-sm text-[color:var(--ok)]">{msg}</p>}
            {armed && <p className="card px-4 py-2.5 text-sm text-[color:var(--zhihu)]">双倍卡已装填——去信息流猜一帖，积分 ×2 结算。</p>}

            {(Object.entries(state.items) as [string, { name: string; price: number; desc: string }][]).map(([key, item]) => (
              <div key={key} className="card flex items-center gap-4 p-5">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[color:var(--bg)] text-3xl">
                  {key === "xray" ? <IconEye size={26} /> : <IconBolt size={26} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {item.name}
                    <span className="tnum ml-2 text-sm font-normal text-[color:var(--gold)]">{item.price} 积分</span>
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--muted)]">{item.desc}</p>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">持有：<b className="tnum">{state.inventory[key] ?? 0}</b></p>
                </div>
                <div className="shrink-0 space-y-1.5 text-right">
                  <button onClick={() => act("buy", key)} disabled={busy} className="btn btn-primary block w-28 px-4 py-1.5 text-sm">
                    购买
                  </button>
                  {key === "double" && (state.inventory.double ?? 0) > 0 && !armed && (
                    <button onClick={() => act("armDouble")} disabled={busy} className="btn btn-outline block w-28 px-4 py-1.5 text-xs">
                      装填一张
                    </button>
                  )}
                  {key === "xray" && (state.inventory.xray ?? 0) > 0 && (
                    <Link href="/" className="btn btn-outline block w-28 px-4 py-1.5 text-xs">
                      去信息流用
                    </Link>
                  )}
                </div>
              </div>
            ))}

            <div className="card p-5 text-xs leading-relaxed text-[color:var(--muted)]">
              <b className="text-sm text-[color:var(--ink)]">怎么赚积分</b>
              <p className="mt-1.5">信息流猜帖：识破 AI +30 · 确认真人 +10 · 误判 −20；1v1 对局：识破伪装者 +80、伪装成功 +50、下注赢家通吃。商店不能买赞、不能直接买答案——只能买更狠的识破工具。</p>
            </div>
          </>
        )}
      </main>
    </>
  );
}
