import { NextRequest, NextResponse } from "next/server";
import { SHOP_ITEMS, buyItem, getInventory, armDouble, type ShopItemKey } from "@/lib/social";
import { resolveSessionUser } from "@/lib/auth/session";
import { bankKeyForUser } from "@/lib/auth/users";
import { store } from "@/lib/game/store";

export const dynamic = "force-dynamic";

/** 积分商店：GET 库存+商品；POST action=buy|armDouble。 */
export async function GET(req: NextRequest) {
  const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const bankKey = bankKeyForUser(user.id);
  return NextResponse.json({
    items: SHOP_ITEMS,
    inventory: getInventory(bankKey),
    bank: store.bank(bankKey),
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

  if (body.action === "buy") {
    const r = buyItem(bankKey, body.item as ShopItemKey, store.bank(bankKey));
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    const bank = store.addBank(bankKey, 0);
    return NextResponse.json({ ok: true, bank, inventory: getInventory(bankKey) });
  }

  if (body.action === "armDouble") {
    if (!armDouble(bankKey)) return NextResponse.json({ error: "没有双倍卡了" }, { status: 400 });
    return NextResponse.json({ ok: true, inventory: getInventory(bankKey), armed: true });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
