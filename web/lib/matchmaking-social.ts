// 同频匹配（灵魂匹配局赛道）
//
// 赛道要求："基于兴趣、观点与内容行为的同好匹配"，且"不只是聊天工具"。
//
// 设计思路：不做问卷、不做标签自填——那些都是用户"声称"的自己。
// 只用**已经发生的行为**建立画像：
//
//   1. 判断偏好 —— 你倾向于把内容判成 AI 还是真人？（怀疑型 / 信任型）
//   2. 话题足迹 —— 你在哪些话题下留下过判断与内容？
//   3. 表达风格 —— 你自己写的内容，取证四维长什么样？
//
// 这三项都是行为数据，骗不了人，也不需要用户额外填表。
//
// 匹配不是"找相似"，而是**找互补的同频者**：
//   - 话题重合度高 → 有共同语言（正相关）
//   - 表达风格接近 → 聊得来（正相关）
//   - 判断倾向相反 → 反而更有讨论价值（适度正相关，避免回声室）
//
// 最后一条是关键：如果只按相似度匹配，会造出信息茧房；
// 让"怀疑型"和"信任型"相遇，讨论才有张力。

import { loadCollection } from "./db";
import { analyze } from "./forensics";
import { listUserPosts } from "./social";

/** 一条判断记录（与 consensus 层同源） */
interface GuessRow {
  postId: string;
  userKey: string;
  pick: "ai" | "human";
  correct: boolean;
  authorName: string;
  at: number;
}

export interface Profile {
  userKey: string;
  displayName: string;
  /** 判断总数 */
  judged: number;
  /** 判成 AI 的比例 0–1：>0.5 偏怀疑，<0.5 偏信任 */
  suspicion: number;
  /** 判断准确率 0–1 */
  accuracy: number;
  /** 话题足迹（来自其发帖与判断过的内容作者） */
  topics: string[];
  /** 自己写的内容的取证剖面 0–100；没写过内容时为 null */
  styleIndex: number | null;
  /** 发帖数 */
  posts: number;
}

export interface MatchResult {
  profile: Profile;
  score: number;
  /** 可解释的匹配理由——赛道明确要求"让讨论更容易开始" */
  reasons: string[];
  /** 系统建议的破冰话题 */
  icebreaker: string;
}

function guessRows(): GuessRow[] {
  return loadCollection<{ list: GuessRow[] }>("feed_consensus", { list: [] }).list;
}

/** 从行为数据构建一个人的画像 */
export function buildProfile(userKey: string, displayName?: string): Profile | null {
  const rows = guessRows().filter((r) => r.userKey === userKey);
  const myPosts = listUserPosts(200).filter((p) => p.authorKey === userKey);

  if (rows.length === 0 && myPosts.length === 0) return null;

  const judged = rows.length;
  const suspicion = judged ? rows.filter((r) => r.pick === "ai").length / judged : 0.5;
  const accuracy = judged ? rows.filter((r) => r.correct).length / judged : 0;

  // 话题足迹：自己发帖的话题 + 判断过的内容作者（作者名可作弱主题信号）
  const topics = [
    ...new Set([...myPosts.map((p) => p.topic), ...rows.slice(-40).map((r) => r.authorName)]),
  ].slice(0, 20);

  // 表达风格：把自己写过的内容拼起来做一次取证
  let styleIndex: number | null = null;
  if (myPosts.length) {
    const text = myPosts.map((p) => p.body).join("\n").slice(0, 3000);
    styleIndex = analyze(text).humanIndex;
  }

  return {
    userKey,
    displayName: displayName ?? myPosts[0]?.authorName ?? "这位居民",
    judged,
    suspicion: Number(suspicion.toFixed(3)),
    accuracy: Number(accuracy.toFixed(3)),
    topics,
    styleIndex,
    posts: myPosts.length,
  };
}

/** 列出所有有行为记录的用户 key */
function allUserKeys(): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of guessRows()) {
    if (!map.has(r.userKey)) map.set(r.userKey, "");
  }
  for (const p of listUserPosts(300)) {
    map.set(p.authorKey, p.authorName);
  }
  return map;
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union ? inter / union : 0;
}

/**
 * 为一个人找同频伙伴。
 *
 * 评分（0–100）：
 *   话题重合  ×40   有共同语言
 *   风格接近  ×30   聊得来
 *   判断互补  ×20   有讨论张力（差异越大分越高，但封顶）
 *   活跃度    ×10   避免匹配到几乎没行为的空账号
 */
export function findMatches(me: Profile, limit = 5): MatchResult[] {
  const out: MatchResult[] = [];

  for (const [key, name] of allUserKeys()) {
    if (key === me.userKey) continue;
    const other = buildProfile(key, name || undefined);
    if (!other) continue;
    // 行为太少的账号不参与匹配，否则推荐没有意义
    if (other.judged + other.posts < 2) continue;

    const topicSim = jaccard(me.topics, other.topics);

    // 风格接近度：两人 styleIndex 差值越小越接近
    let styleSim = 0.5;
    if (me.styleIndex !== null && other.styleIndex !== null) {
      styleSim = 1 - Math.min(1, Math.abs(me.styleIndex - other.styleIndex) / 60);
    }

    // 判断互补：倾向差异带来讨论张力，但差太多也聊不到一起，取 0.5 为最佳差值
    const diff = Math.abs(me.suspicion - other.suspicion);
    const complement = 1 - Math.abs(diff - 0.35) / 0.65;

    const activity = Math.min(1, (other.judged + other.posts * 3) / 20);

    const score = Math.round(
      topicSim * 40 + styleSim * 30 + Math.max(0, complement) * 20 + activity * 10,
    );

    // 可解释理由：赛道要求"让一次讨论更容易开始"
    const reasons: string[] = [];
    const shared = me.topics.filter((t) => other.topics.includes(t)).slice(0, 3);
    if (shared.length) {
      reasons.push(`你们都关注过：${shared.join("、")}`);
    }
    if (me.styleIndex !== null && other.styleIndex !== null && styleSim > 0.6) {
      reasons.push("表达风格接近，写东西的节奏是一路的");
    }
    if (diff > 0.2) {
      const meType = me.suspicion > 0.5 ? "偏怀疑" : "偏信任";
      const otherType = other.suspicion > 0.5 ? "偏怀疑" : "偏信任";
      reasons.push(`判断倾向不同（你${meType}，TA${otherType}）——这种组合讨论起来更有意思`);
    }
    if (other.accuracy >= 0.6 && other.judged >= 5) {
      reasons.push(`TA 的判断准确率 ${Math.round(other.accuracy * 100)}%，值得请教`);
    }
    if (!reasons.length) reasons.push("你们都在这个社区里认真判断过内容");

    out.push({
      profile: other,
      score,
      reasons: reasons.slice(0, 3),
      icebreaker: icebreakerFor(me, other, shared),
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** 生成破冰话题——赛道要求"让讨论更容易开始" */
function icebreakerFor(me: Profile, other: Profile, shared: string[]): string {
  if (shared.length) {
    return `关于「${shared[0]}」，你们的判断可能不一样——要不要各自说说是怎么看的？`;
  }
  if (Math.abs(me.suspicion - other.suspicion) > 0.3) {
    const who = me.suspicion > other.suspicion ? "你更容易怀疑" : "TA 更容易怀疑";
    return `${who}一段内容是 AI 写的。聊聊各自的判断依据？`;
  }
  if (other.styleIndex !== null && other.styleIndex < 40) {
    return "TA 写东西挺工整的，问问是不是故意在模仿 AI？";
  }
  return "你们都在这儿判断过不少内容，交换一下自己的识别心得？";
}
