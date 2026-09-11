// Agent 自主生活系统：居民会自己刷社区、读帖、评论、点赞——
// 行为模仿真人习惯：短句口语、偶尔错字、情绪化、只对一部分帖子感兴趣、大量"潜水"。
// 环境变量 AGENT_AUTONOMY=off 可关闭。
import { randomBytes } from "node:crypto";
import { RESIDENTS } from "../feed/residents";
import { secureRand } from "./router";

export interface AgentActivity {
  id: string;
  agentName: string;
  action: "comment" | "vote" | "read";
  detail: string;
  at: number;
}

const g = globalThis as unknown as {
  __huzhiLife?: boolean;
  __huzhiLifeLog?: AgentActivity[];
};

export function lifeLog(): AgentActivity[] {
  return (g.__huzhiLifeLog ??= []);
}

function log(agentName: string, action: AgentActivity["action"], detail: string): void {
  const entries = lifeLog();
  entries.unshift({ id: randomBytes(4).toString("hex"), agentName, action, detail, at: Date.now() });
  if (entries.length > 40) entries.length = 40;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(secureRand() * arr.length)];
}

/** 注入真人痕迹：偶发错字（重复字）、语气尾巴、口语标点。 */
function humanize(s: string): string {
  let out = s;
  if (secureRand() < 0.3 && out.length > 4) {
    const i = 1 + Math.floor(secureRand() * (out.length - 3));
    out = out.slice(0, i) + out[i] + out.slice(i);
  }
  if (secureRand() < 0.35) out += pick(["~", "…", "hh", "😂", "😅", "。。"]);
  if (secureRand() < 0.25) out = out.replace(/。$/, "");
  return out;
}

function commentFor(title: string, author: string): string {
  const t = title.length > 12 ? title.slice(0, 11) + "…" : title;
  const pool = [
    `哈哈这个我昨天刚刷到`,
    `蹲一个后续`,
    `${author}这个角度有点东西`,
    `说真的，评论区比正文精彩`,
    `之前跟朋友还争论过来着`,
    ` Mark 一下晚上回来看`,
    `有一说一，还挺认同的`,
    `怎么感觉这事还没完`,
    `我持保留意见，等反转`,
    `笑死，这都能上热榜`,
    `路过留名，内容不错`,
    `不太懂但大受震撼`,
    `刚想搜这个就刷到了`,
    `所以到底谁说得对？`,
    `支持一下，写得很细`,
  ];
  return humanize(pick(pool));
}

/** 单次行为：大概率潜水/读帖，其次评论、点赞。 */
async function tick(): Promise<void> {
  const roll = secureRand();
  if (roll < 0.45) {
    const r = pick(RESIDENTS);
    log(r.name, "read", "刷了刷社区，没留下痕迹");
    return;
  }
  // 惰性动态导入，避免 feed ↔ autonomous 循环依赖
  const feed = await import("@/lib/feed");
  const sample = feed.sampleFeedPosts(4);
  if (sample.length === 0) return;
  const post = pick(sample);
  const resident = pick(RESIDENTS);

  if (roll < 0.78) {
    const seeded = feed.ensureCommentsSeeded(post.id, post.topic);
    if (!seeded) return;
    const c = feed.addComment(post.id, resident.name, commentFor(post.title, post.authorName), {
      isAgent: true,
      authorBio: resident.bio,
      hueA: resident.hueA,
      hueB: resident.hueB,
    });
    if (c) log(resident.name, "comment", `评论了「${post.title.slice(0, 16)}…」`);
  } else if (roll < 0.92) {
    feed.votePost(post.id, `agent:${resident.id}`);
    log(resident.name, "vote", `赞同了「${post.title.slice(0, 16)}…」`);
  } else {
    log(resident.name, "read", "读了几个帖子，点了赞就走了");
  }
}

/** 启动自主生活循环（幂等；AGENT_AUTONOMY=off 关闭）。 */
export function ensureAgentLife(): void {
  if (process.env.AGENT_AUTONOMY === "off") return;
  if (g.__huzhiLife) return;
  g.__huzhiLife = true;
  const loop = () => {
    void tick().catch(() => {
      // 后台行为失败不影响主业务
    });
    setTimeout(loop, 25000 + Math.floor(secureRand() * 35000)); // 25–60s 随机间隔
  };
  setTimeout(loop, 15000); // 启动 15s 后开始"上网"
}
