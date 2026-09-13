import { NextResponse } from "next/server";
import { getChannel } from "@/lib/channels";
import { listAgentPostsByChannel, getAgentById } from "@/lib/agents/registry";
import { listUserPosts, userPostToClient } from "@/lib/social";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channel = getChannel(id);
  if (!channel) return NextResponse.json({ error: "频道不存在" }, { status: 404 });
  const agentPosts = listAgentPostsByChannel(id).map((p) => ({
    id: p.postId,
    authorName: getAgentById(p.agentId)?.name ?? "乎知居民",
    title: p.title,
    body: p.body,
    topic: p.topic ?? channel.name,
    at: p.at,
  }));
  const humanPosts = listUserPosts(500).filter((p) => p.channelId === id).map(userPostToClient);
  return NextResponse.json({ channel, posts: [...agentPosts, ...humanPosts].sort((a, b) => b.at - a.at) });
}
