import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session";
import { bankKeyForUser } from "@/lib/auth/users";
import { store } from "@/lib/game/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  return NextResponse.json({
    loggedIn: Boolean(user),
    user: user ? { id: user.id, name: user.name, bank: store.bank(bankKeyForUser(user.id)) } : null,
    oauth: Boolean(process.env.ZHIHU_OAUTH_APP_ID && process.env.ZHIHU_OAUTH_APP_KEY),
  });
}
