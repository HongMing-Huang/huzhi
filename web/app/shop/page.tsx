"use client";

// 积分商店：积分的「使用」出口。道具真实可用——
// 透视镜：在帖子详情页直接查看身份判定与理由；双倍卡：装填后下一次猜帖积分 ×2。
// 每日签到：连续签到递增奖励，是积分的「获取」入口之一。
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { IconEye, IconBolt, IconSearch, IconFire } from "@/components/Icons";
import { AppHeader, MobileDock, PageFrame } from "@/components/AppChrome";
import IdentityConstellation from "@/components/IdentityConstellation";

gsap.registerPlugin(useGSAP);

interface Items {
  xray?: { name: string; price: number; desc: string };
  double?: { name: string; price: number; desc: string };
  insurance?: { name: string; price: number; desc: string };
}

interface CheckinState {
  doneToday: boolean;
  streak: number;
  rewardToday: number;
}

interface LedgerEntry {
  id: string;
  delta: number;
  balance: number;
  reason: string;
  at: number;
}

export default function ShopPage() {
  const [state, setState] = useState<{ items: Items; inventory: Record<string, number>; bank: number; checkin: CheckinState; ledger: LedgerEntry[] } | null>(null);
  const [unauth, setUnauth] = useState(false);
  const [msg, setMsg] = useState("");
  const [armed, setArmed] = useState(false);
  const [armedInsurance, setArmedInsurance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkinMsg, setCheckinMsg] = useState("");
  const coinRef = useRef<HTMLSpanElement>(null);

  useGSAP(() => {
    const reduce =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.reduceMotion === "1";
    gsap.from("[data-shop-fade]", {
      autoAlpha: 0,
      y: reduce ? 0 : 12,
      duration: reduce ? 0.01 : 0.5,
      stagger: reduce ? 0 : 0.06,
      ease: "power2.out",
    });
  });

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
      setState((prev) => (prev ? { ...prev, bank: d.bank ?? prev.bank, inventory: d.inventory ?? prev.inventory, checkin: d.checkin ?? prev.checkin, ledger: d.ledger ?? prev.ledger } : prev));
      setMsg(action === "buy" ? "购买成功！" : action === "armInsurance" ? "止损券已装填：下一场 1v1 误判时回收一半注金" : "双倍卡已装填：下一次猜帖积分 ×2");
      if (d.armed) setArmed(true);
      if (d.armedInsurance) setArmedInsurance(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function checkin() {
    if (busy) return;
    setBusy(true);
    setCheckinMsg("");
    try {
      const res = await fetch("/api/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkin" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "签到失败");
      setState((prev) => (prev ? { ...prev, bank: d.bank ?? prev.bank, checkin: d.checkin ?? prev.checkin, ledger: d.ledger ?? prev.ledger } : prev));

      // 积分弹跳动效
      if (coinRef.current) {
        gsap.fromTo(coinRef.current,
          { scale: 1, color: "#ffb547" },
          { scale: 1.6, color: "#ff8c00", duration: 0.3, yoyo: true, repeat: 1, ease: "back.out(2)" },
        );
      }
      setCheckinMsg(`签到成功！+${d.reward} 积分（连续 ${d.streak} 天）`);
    } catch (e) {
      setCheckinMsg(e instanceof Error ? e.message : "签到失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppHeader title="积分商店" right={state && <span className="text-sm">积分 <b ref={coinRef} className="tnum text-[color:var(--gold)]">{state.bank}</b></span>} />
      <PageFrame>
        <section data-shop-fade className="page-lead pt-1">
          <p className="page-kicker">判断力的使用出口</p>
          <h1 className="page-title">把积分换成下一次博弈的筹码</h1>
          <p className="page-summary">道具不替你作答，只放大观察、下注与逆风判断的乐趣。</p>
        </section>

        {state && <div data-shop-fade className="mt-4"><IdentityConstellation bank={state.bank} /></div>}

        <div className="mt-4 space-y-3">
        {unauth && (
          <div data-shop-fade className="card p-10 text-center">
            <p className="text-sm text-[color:var(--meta)]">商店需要登录（道具绑定账户，跨设备可用）。</p>
            <Link href="/login" className="btn btn-primary mt-4">去登录 / 注册</Link>
          </div>
        )}
        {!unauth && !state && <p data-shop-fade className="card p-8 text-center text-sm text-[color:var(--time)]">商店装载中…</p>}
        {state && (
          <>
            {/* 每日签到 */}
            <div data-shop-fade className="card card-hover flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[rgba(255,181,71,.14)] text-[#b56b00]">
                <IconFire size={26} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">每日签到</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-[color:var(--meta)]">
                  每天来领基础积分，连续签到递增奖励：第 1 天 50 分，每多 1 天 +10 分，封顶 90 分/天。
                </p>
                <p className="mt-1 text-[13px] text-[color:var(--time)]">
                  已连续 <b className="tnum text-[color:var(--gold)]">{state.checkin.streak}</b> 天
                  {state.checkin.doneToday ? " · 今日已签到" : ` · 今日可领 ${state.checkin.rewardToday} 分`}
                </p>
                {checkinMsg && <p className="mt-1.5 text-[13px] text-[color:var(--ok)]">{checkinMsg}</p>}
              </div>
              <button
                onClick={checkin}
                disabled={busy || state.checkin.doneToday}
                className={`btn w-full shrink-0 sm:w-28 ${state.checkin.doneToday ? "btn-outline opacity-60" : "btn-primary"}`}
              >
                {state.checkin.doneToday ? "已签到" : "签到"}
              </button>
            </div>

            {msg && <p data-shop-fade className="card px-4 py-2.5 text-sm text-[color:var(--ok)]">{msg}</p>}
            {armed && <p data-shop-fade className="card px-4 py-2.5 text-sm text-[color:var(--zhihu)]">双倍卡已装填——去信息流猜一帖，积分 ×2 结算。</p>}
            {armedInsurance && <p data-shop-fade className="card px-4 py-2.5 text-sm text-[color:var(--zhihu)]">止损券已装填——下一场 1v1 有效锁注时自动生效。</p>}

            {(Object.entries(state.items) as [string, { name: string; price: number; desc: string }][]).map(([key, item]) => (
              <div key={key} data-shop-fade className="card card-hover flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
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
                  {key === "insurance" && (state.inventory.insurance ?? 0) > 0 && !armedInsurance && (
                    <button onClick={() => act("armInsurance")} disabled={busy} className="btn btn-outline w-28">
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

            <div data-shop-fade className="card card-hover flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[rgba(255,181,71,.14)] text-[#b56b00]">
                <IconSearch size={26} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">单项取证 <span className="tnum ml-2 text-sm font-normal text-[color:var(--gold)]">10–20 积分</span></p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-[color:var(--meta)]">判断前翻开归因、事实锚点、时间线或文风证据。只给可以争论的线索，不替你回答。</p>
                <p className="mt-1 text-[13px] text-[color:var(--time)]">在任意帖子详情页按需购买，无需囤卡。</p>
              </div>
              <Link href="/" className="btn btn-outline w-full shrink-0 sm:w-28">去挑一帖</Link>
            </div>

            <div data-shop-fade className="card p-5 text-[13px] leading-relaxed text-[color:var(--meta)]">
              <b className="text-sm text-[color:var(--ink)]">怎么赚积分</b>
              <p className="mt-1.5">每日签到 +50~90；信息流猜帖：识破 AI +30 · 确认真人 +10 · 误判 −20；1v1 对局：识破伪装者 +80、伪装成功 +50、下注赢家通吃。积分用于判断前取证、风险加倍、1v1 止损和教学式透视，不能买赞或改变真实身份。</p>
            </div>

            <section data-shop-fade className="card overflow-hidden">
              <div className="border-b border-[color:var(--line)] px-5 py-4">
                <p className="font-semibold text-[color:var(--ink)]">积分账单</p>
                <p className="mt-0.5 text-[12px] text-[color:var(--time)]">判断、取证、下注和购买，每一笔都有来源。</p>
              </div>
              {state.ledger.length === 0 ? (
                <p className="px-5 py-7 text-center text-[13px] text-[color:var(--time)]">还没有积分记录，先去判断一篇帖子。</p>
              ) : (
                <div className="divide-y divide-[color:var(--frame)]">
                  {state.ledger.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-[color:var(--ink-2)]">{entry.reason}</p>
                        <p className="mt-0.5 text-[11px] text-[color:var(--time)]">{new Date(entry.at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                      <b className={`tnum text-sm ${entry.delta > 0 ? "text-[color:var(--ok)]" : "text-[color:var(--like)]"}`}>
                        {entry.delta > 0 ? "+" : ""}{entry.delta}
                      </b>
                      <span className="tnum w-16 text-right text-[12px] text-[color:var(--time)]">余 {entry.balance}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
        </div>
      </PageFrame>
      <MobileDock />
    </>
  );
}
