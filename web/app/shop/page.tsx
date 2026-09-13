"use client";

// 积分商店：积分的「使用」出口。道具真实可用——
// 透视镜：在帖子详情页直接查看身份判定与理由；双倍卡：装填后下一次猜帖积分 ×2。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IconEye, IconBolt } from "@/components/Icons";
import { AppHeader, MobileDock, PageFrame } from "@/components/AppChrome";

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
      <AppHeader title="积分商店" right={state && <span className="text-sm">积分 <b className="tnum text-[color:var(--gold)]">{state.bank}</b></span>} />
      <PageFrame>
        <section className="page-lead pt-1">
          <p className="page-kicker">判断力的使用出口</p>
          <h1 className="page-title">把积分换成下一次博弈的筹码</h1>
          <p className="page-summary">道具不替你作答，只放大观察、下注与逆风判断的乐趣。</p>
        </section>
        <div className="mt-4 space-y-3">
        {unauth && (
          <div className="card p-10 text-center">
            <p className="text-sm text-[color:var(--meta)]">商店需要登录（道具绑定账户，跨设备可用）。</p>
            <Link href="/login" className="btn btn-primary mt-4">去登录 / 注册</Link>
          </div>
        )}
        {!unauth && !state && <p className="card p-8 text-center text-sm text-[color:var(--time)]">商店装载中…</p>}
        {state && (
          <>
            {msg && <p className="card px-4 py-2.5 text-sm text-[color:var(--ok)]">{msg}</p>}
            {armed && <p className="card px-4 py-2.5 text-sm text-[color:var(--zhihu)]">双倍卡已装填——去信息流猜一帖，积分 ×2 结算。</p>}

            {(Object.entries(state.items) as [string, { name: string; price: number; desc: string }][]).map(([key, item]) => (
              <div key={key} className="card card-hover flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[rgba(23,114,246,.08)] text-[color:var(--zhihu)]">
                  {key === "xray" ? <IconEye size={26} /> : <IconBolt size={26} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {item.name}
                    <span className="tnum ml-2 text-sm font-normal text-[color:var(--gold)]">{item.price} 积分</span>
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-[color:var(--meta)]">{item.desc}</p>
                  <p className="mt-1 text-[13px] text-[color:var(--time)]">持有：<b className="tnum">{state.inventory[key] ?? 0}</b></p>
                </div>
                <div className="grid w-full shrink-0 gap-1.5 sm:w-auto">
                  <button onClick={() => act("buy", key)} disabled={busy} className="btn btn-primary w-28">
                    购买
                  </button>
                  {key === "double" && (state.inventory.double ?? 0) > 0 && !armed && (
                    <button onClick={() => act("armDouble")} disabled={busy} className="btn btn-outline w-28">
                      装填一张
                    </button>
                  )}
                  {key === "xray" && (state.inventory.xray ?? 0) > 0 && (
                    <Link href="/" className="btn btn-outline w-28">
                      去信息流用
                    </Link>
                  )}
                </div>
              </div>
            ))}

            <div className="card p-5 text-[13px] leading-relaxed text-[color:var(--meta)]">
              <b className="text-sm text-[color:var(--ink)]">怎么赚积分</b>
              <p className="mt-1.5">信息流猜帖：识破 AI +30 · 确认真人 +10 · 误判 −20；1v1 对局：识破伪装者 +80、伪装成功 +50、下注赢家通吃。商店不能买赞、不能直接买答案——只能买更狠的识破工具。</p>
            </div>
          </>
        )}
        </div>
      </PageFrame>
      <MobileDock />
    </>
  );
}
