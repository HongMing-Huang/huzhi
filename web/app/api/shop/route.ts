import { NextRequest, NextResponse } from "next/server";
import { SHOP_ITEMS, buyItem, getInventory, armDouble, armInsurance, getCheckinState, doCheckin, type ShopItemKey } from "@/lib/social";
import { resolveSessionUser } from "@/lib/auth/session";
import { bankKeyForUser } from "@/lib/auth/users";
import { store } from "@/lib/game/store";

export const dynamic = "force-dynamic";

/** 积分商店：GET 库存+商品+签到状态；POST action=buy|armDouble|checkin。 */
export async function GET(req: NextRequest) {
  const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const bankKey = bankKeyForUser(user.id);
  return NextResponse.json({
    items: SHOP_ITEMS,
    inventory: getInventory(bankKey),
    bank: store.bank(bankKey),
    ledger: store.ledger(bankKey, 12),
    checkin: getCheckinState(bankKey),
  });
}

export async function POST(req: NextRequest) {
  const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const bankKey = bankKeyForUser(user.id);

  let body: { action?: string; item?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  if (body.action === "checkin") {
    const r = doCheckin(bankKey);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, reward: r.reward, streak: r.streak, bank: r.bank, checkin: getCheckinState(bankKey), ledger: store.ledger(bankKey, 12) });
  }

  if (body.action === "buy") {
    const before = store.bank(bankKey);
    const item = body.item as ShopItemKey;
    const r = buyItem(bankKey, item, before);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    // buyItem 负责校验并写入库存；余额必须在同一次成功请求中真实扣除。
    // 旧实现 addBank(..., 0) 会出现“库存增加但积分不变”的经济漏洞。
    const bank = store.addBank(bankKey, -(SHOP_ITEMS[item]?.price ?? 0), `购买：${SHOP_ITEMS[item]?.name ?? item}`);
    return NextResponse.json({ ok: true, bank, inventory: getInventory(bankKey), ledger: store.ledger(bankKey, 12) });
  }

  if (body.action === "armDouble") {
    if (!armDouble(bankKey)) return NextResponse.json({ error: "没有双倍卡了" }, { status: 400 });
    return NextResponse.json({ ok: true, inventory: getInventory(bankKey), armed: true });
  }

  if (body.action === "armInsurance") {
    if (!armInsurance(bankKey)) return NextResponse.json({ error: "没有止损券了" }, { status: 400 });
    return NextResponse.json({ ok: true, inventory: getInventory(bankKey), armedInsurance: true });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
