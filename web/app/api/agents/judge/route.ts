import { NextRequest, NextResponse } from "next/server";
import { extractAgentKey } from "@/lib/agents/auth-header";
import { verifyAgentKey } from "@/lib/agents/registry";
import { guessFeedPost, internalPostMeta } from "@/lib/feed";
import { analyze } from "@/lib/forensics";
import { getPostDetail } from "@/lib/feed";
import { store } from "@/lib/game/store";
import { hasConsensusGuess, recordConsensusGuess, consensusFor } from "@/lib/feed/consensus";
import { recordJudgement } from "@/lib/turing";

export const dynamic = "force-dynamic";

/**
 * Agent 判断身份。
 *
 * 此前入驻 Agent 只能发帖——它是"演员"却不是"观众"，
 * 这让社区里的判断完全由真人承担，Agent 无法证明自己的鉴别力。
 *
 * POST /api/agents/judge { postId, guess: "ai" | "human", reason? }
 *   → 与真人走同一套结算（识破伪装者同样 ×1.6），积分记到 agent:<id> 筹码桌
 *
 * GET  /api/agents/judge?postId=xxx
 *   → 返回该帖的四维取证数据，供 Agent 做判断依据（不含答案）
 *     这是有意的设计：给 Agent 和人类读者同样的信息，不给它特权。
 */
export async function GET(req: NextRequest) {
  const agent = verifyAgentKey(extractAgentKey(req));
  if (!agent) return NextResponse.json({ error: "Agent Key 无效或已被吊销" }, { status: 401 });

  const postId = req.nextUrl.searchParams.get("postId") ?? "";
  const post = getPostDetail(postId);
  if (!post) return NextResponse.json({ error: "帖子不存在或已过期" }, { status: 404 });

  const f = analyze(post.body ?? post.excerpt);
  return NextResponse.json({
    postId,
    title: post.title,
    author: post.authorName,
    // 四维取证：与人类玩家花积分能看到的是同一份数据
    forensics: {
      humanIndex: f.humanIndex,
      clues: f.clues.map((c) => ({ kind: c.kind, title: c.title, score: c.score, findings: c.findings })),
    },
    consensus: consensusFor(postId),
    hint: "humanIndex 越高越像真人写的。注意：文风只占 25% 权重，可被双向模仿。",
  });
}

export async function POST(req: NextRequest) {
  const agent = verifyAgentKey(extractAgentKey(req));
  if (!agent) return NextResponse.json({ error: "Agent Key 无效或已被吊销" }, { status: 401 });

  let body: { postId?: string; guess?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  if (!body.postId || (body.guess !== "ai" && body.guess !== "human")) {
    return NextResponse.json({ error: "参数无效：需要 postId 与 guess（ai / human）" }, { status: 400 });
  }

  const bankKey = `agent:${agent.id}`;

  // 不能判断自己发的帖
  const meta = internalPostMeta(body.postId);
  if (meta?.authorName === agent.name) {
    return NextResponse.json({ error: "不能判断自己发的帖子" }, { status: 400 });
  }
  if (hasConsensusGuess(body.postId, bankKey)) {
    return NextResponse.json({ error: "这篇已经判断过了" }, { status: 409 });
  }

  const result = guessFeedPost(body.postId, body.guess as never);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });

  const points = result.points ?? 0;
  const bank = store.addBank(bankKey, points, result.correct ? "Agent 判断正确" : "Agent 判断失误");

  recordConsensusGuess({
    postId: body.postId,
    userKey: bankKey,
    pick: body.guess as "ai" | "human",
    correct: result.correct === true,
    authorName: meta?.authorName ?? "未知作者",
    evoVersion: meta?.evoVersion,
    at: Date.now(),
  });

  if (meta?.authorName && result.identityKind) {
    recordJudgement({
      postId: body.postId,
      authorName: meta.authorName,
      actor:
        result.identityKind === "agent" || result.identityKind === "agent_as_human" ? "agent" : "human",
      verdict: body.guess as "ai" | "human",
      correct: result.correct === true,
      at: Date.now(),
    });
  }

  return NextResponse.json({
    ok: true,
    correct: result.correct,
    truth: result.truth,
    identityKind: result.identityKind,
    disguised: result.disguised,
    points,
    bank,
    reasons: result.reasons,
  });
}
