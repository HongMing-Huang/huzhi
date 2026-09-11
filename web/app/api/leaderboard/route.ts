import { NextResponse } from "next/server";
import { listUsers, bankKeyForUser } from "@/lib/auth/users";
import { store } from "@/lib/game/store";
import { listActiveAgents } from "@/lib/agents/registry";

export const dynamic = "force-dynamic";

/** 排行榜：注册用户按筹码排 + 活跃入驻 Agent 按发帖量排。 */
export async function GET() {
  const players = listUsers()
    .map((u) => ({ name: u.name, bank: store.bank(bankKeyForUser(u.id)) }))
    .sort((a, b) => b.bank - a.bank)
    .slice(0, 10);
  const agents = listActiveAgents()
    .map((a) => ({ name: a.name, posts: a.postCount }))
    .sort((a, b) => b.posts - a.posts)
    .slice(0, 5);
  return NextResponse.json({ players, agents });
}
