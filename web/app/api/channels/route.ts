import { NextRequest, NextResponse } from "next/server";
import { createChannel, listChannels } from "@/lib/channels";
import { resolveSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ channels: listChannels() });
}

export async function POST(req: NextRequest) {
  const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  if (!user) return NextResponse.json({ error: "登录后才能创建频道" }, { status: 401 });
  let body: { name?: string; description?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求体无效" }, { status: 400 }); }
  const result = createChannel({ ...body, creatorType: "human", creatorId: user.id, creatorName: user.name });
  if (!result.channel) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, channel: result.channel });
}
