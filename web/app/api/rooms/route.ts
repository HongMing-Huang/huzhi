import { NextRequest, NextResponse } from "next/server";
import { createRoom } from "@/lib/game/engine";
import { getHotTopics, FALLBACK_TOPICS } from "@/lib/zhihu/hot";
import { secureRand } from "@/lib/agents/router";
import { resolveSessionUser } from "@/lib/auth/session";
import { bankKeyForUser } from "@/lib/auth/users";
import type { Topic } from "@/lib/game/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { name?: string; topicId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  // 已登录：名号默认取账号名，筹码记到账号；游客：用输入名号
  const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  const name = (body.name ?? "").trim().slice(0, 20) || user?.name || "";
  if (!name) return NextResponse.json({ error: "先给自己起个名号（或登录）" }, { status: 400 });

  const hot = await getHotTopics(12);
  let topic: Topic;
  if (body.topicId) {
    topic = hot.topics.find((t) => t.id === body.topicId) ?? hot.topics[0];
  } else {
    topic = hot.topics[Math.floor(secureRand() * hot.topics.length)];
  }
  if (!topic) topic = FALLBACK_TOPICS[0];

  const room = createRoom(name, topic, user ? bankKeyForUser(user.id) : undefined);
  const you = room.players[0];
  return NextResponse.json({ roomId: room.id, playerId: you.id, identity: you.identity });
}
