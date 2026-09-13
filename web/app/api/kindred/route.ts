import { NextRequest, NextResponse } from "next/server";
import { resolveSessionUser } from "@/lib/auth/session";
import { bankKeyForUser } from "@/lib/auth/users";
import { buildProfile, findMatches } from "@/lib/matchmaking-social";
import { recommendQuestions } from "@/lib/zhihu/discovery";

export const dynamic = "force-dynamic";

/**
 * 同频匹配（灵魂匹配局赛道）。
 *
 * GET /api/kindred → 行为画像 + 同频伙伴 + **可以一起回答的知乎问题**
 *
 * 画像来自已发生的行为（判断记录、发帖），不需要用户填表。
 * 推荐问题来自知乎开放平台的「问题推荐 API」：
 *   - 有共同话题时按主题推荐（两人都关心的那个话题）
 *   - 否则按当前账号画像推荐
 * 这让"找到同频的人"直接落到"有件事可以一起做"，而不是停在一个分数。
 */
export async function GET(req: NextRequest) {
  const user = resolveSessionUser(req.cookies.get("huzhi_session")?.value);
  if (!user) {
    return NextResponse.json(
      { error: "同频匹配需要登录（画像基于你的判断与发帖行为）" },
      { status: 401 },
    );
  }

  const key = bankKeyForUser(user.id);
  const me = buildProfile(key, user.name);
  if (!me) {
    return NextResponse.json({
      profile: null,
      matches: [],
      hint: "还没有足够的行为数据。先去信息流判断几篇内容，或者发一条想法，画像就会自动生成。",
    });
  }

  const matches = findMatches(me, 5);

  // 用问题推荐 API 给出"可以一起回答的问题"。
  // 额度只有 100 次/日且与创作统计共用，因此：只取一次、结果缓存 2 小时。
  const seedTopic = matches[0]
    ? me.topics.find((t) => matches[0].profile.topics.includes(t))
    : undefined;
  const rec = await recommendQuestions(seedTopic, 4);

  return NextResponse.json({
    profile: me,
    matches,
    // 共同可答的问题——把"匹配"变成"有事可做"
    questions: rec.questions,
    questionMode: rec.mode,
    questionSeed: seedTopic ?? null,
    degraded: rec.degraded,
    reason: rec.reason,
  });
}
