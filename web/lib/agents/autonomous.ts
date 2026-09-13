// Agent 自主生活系统 v2：让社区"看起来有人在活动"，而不是"人人都在回帖"。
//
// 为什么重写：v1 的行为分布是 45% 潜水 / 33% 评论 / 14% 点赞 / 8% 只读。
// 三分之一的行动都是评论，结果每篇帖子底下都挂满回复——这恰恰是最不像真人的地方。
//
// 真实社区的参与是**重尾分布**：绝大多数人只是划过去，
// 一小部分点个赞，极少数才留言。参考 Reddit/知乎公开的互动漏斗量级：
// 浏览 : 点赞 : 评论 ≈ 100 : 10 : 1。这里不追求精确复刻，但要保住这个量级差。
//
// 同时补上三个"活人特征"：
//   1. 兴趣匹配 —— 居民只对自己领域的话题有反应，刷到不感兴趣的直接划走
//   2. 作息节律 —— 深夜活跃度下降，早晚高峰上升
//   3. 疲劳与冷却 —— 同一个居民不会连续刷屏，评论过的帖子不再重复评论
//
// 环境变量 AGENT_AUTONOMY=off 可关闭。
import { randomBytes } from "node:crypto";
import { RESIDENTS, type Resident } from "../feed/residents";
import { secureRand } from "./router";

export interface AgentActivity {
  id: string;
  agentName: string;
  action: "comment" | "vote" | "read" | "skip";
  detail: string;
  at: number;
}

const g = globalThis as unknown as {
  __huzhiLife?: boolean;
  __huzhiLifeLog?: AgentActivity[];
  /** 居民上次留言时间，用于冷却（同一人不刷屏） */
  __huzhiLastComment?: Map<string, number>;
  /** 已评论过的 (居民,帖子) 组合，避免重复留言 */
  __huzhiCommented?: Set<string>;
  /** 行为计数，用于运行时断言分布是否合理 */
  __huzhiBehaviorStats?: Record<string, number>;
};

export function lifeLog(): AgentActivity[] {
  return (g.__huzhiLifeLog ??= []);
}

/** 行为分布统计（供验证与 /api/agents/activity 展示） */
export function behaviorStats(): Record<string, number> {
  return (g.__huzhiBehaviorStats ??= { read: 0, skip: 0, vote: 0, comment: 0 });
}

function bump(action: string): void {
  const s = behaviorStats();
  s[action] = (s[action] ?? 0) + 1;
}

function log(agentName: string, action: AgentActivity["action"], detail: string): void {
  bump(action);
  // 只把"看得见的痕迹"写进公开动态；纯路过不占位置，否则动态流会被灌满
  if (action === "skip") return;
  const entries = lifeLog();
  entries.unshift({ id: randomBytes(4).toString("hex"), agentName, action, detail, at: Date.now() });
  if (entries.length > 40) entries.length = 40;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(secureRand() * arr.length)];
}

// ---------------------------------------------------------------------------
// 1. 兴趣匹配：居民只对自己关心的话题有反应
// ---------------------------------------------------------------------------

/** 各文风居民关心的关键词（命中则更可能互动） */
const INTERESTS: Record<Resident["flavor"], string[]> = {
  scholar: ["研究", "数学", "科学", "AI", "模型", "逻辑", "论文", "教育", "理论", "数据"],
  sharer: ["经历", "生活", "工作", "租房", "情感", "职场", "医院", "考试", "美食", "旅行"],
  quips: ["热榜", "瓜", "明星", "翻车", "热搜", "离谱", "争议", "评论区", "梗"],
  insider: ["行业", "公司", "内部", "从业", "价格", "规则", "流程", "监管", "运营"],
};

/**
 * 兴趣得分 0–1：命中关键词越多越高。
 * 完全不相关时返回一个很低的基线（人偶尔也会对陌生话题好奇）。
 */
function interestScore(r: Resident, title: string, topic: string): number {
  const text = `${title} ${topic}`;
  const kws = INTERESTS[r.flavor];
  const hits = kws.filter((k) => text.includes(k)).length;
  if (hits === 0) return 0.12;
  return Math.min(1, 0.35 + hits * 0.25);
}

// ---------------------------------------------------------------------------
// 2. 作息节律：深夜安静，早晚活跃
// ---------------------------------------------------------------------------

/** 返回当前时段的活跃系数（0.2–1.2） */
function circadianFactor(): number {
  const h = new Date().getHours();
  if (h >= 2 && h < 7) return 0.2; // 凌晨：几乎没人
  if (h >= 7 && h < 9) return 0.9; // 早高峰通勤刷手机
  if (h >= 9 && h < 12) return 0.7;
  if (h >= 12 && h < 14) return 1.0; // 午休
  if (h >= 14 && h < 18) return 0.6; // 上班时间摸鱼
  if (h >= 18 && h < 23) return 1.2; // 晚间高峰
  return 0.45; // 23–2 点，夜猫子
}

// ---------------------------------------------------------------------------
// 3. 冷却：同一居民不刷屏，同一帖不重复留言
// ---------------------------------------------------------------------------

const COMMENT_COOLDOWN_MS = 8 * 60 * 1000; // 同一居民 8 分钟内不再留言

function lastCommentMap(): Map<string, number> {
  return (g.__huzhiLastComment ??= new Map());
}
function commentedSet(): Set<string> {
  return (g.__huzhiCommented ??= new Set());
}

function canComment(r: Resident, postId: string): boolean {
  if (commentedSet().has(`${r.id}|${postId}`)) return false;
  const last = lastCommentMap().get(r.id) ?? 0;
  return Date.now() - last > COMMENT_COOLDOWN_MS;
}

function markCommented(r: Resident, postId: string): void {
  commentedSet().add(`${r.id}|${postId}`);
  lastCommentMap().set(r.id, Date.now());
  // 防内存无限增长
  const set = commentedSet();
  if (set.size > 5000) set.clear();
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

/** 按文风给出不同口吻的评论（避免所有居民一个腔调） */
function commentFor(r: Resident, title: string, author: string): string {
  const common = [
    `蹲一个后续`,
    `Mark 一下晚上回来看`,
    `刚想搜这个就刷到了`,
    `路过留名`,
    `所以到底谁说得对？`,
  ];
  const byFlavor: Record<Resident["flavor"], string[]> = {
    scholar: [
      `有数据支持吗`,
      `这个结论下得有点快`,
      `${author}的第二段我不太同意`,
      `样本量是多少`,
      `逻辑上说得通，但前提可能不成立`,
    ],
    sharer: [
      `我也遇到过类似的`,
      `之前跟朋友还争论过来着`,
      `看完有点难受`,
      `谢谢分享，挺有用的`,
      `我当时的做法和你相反`,
    ],
    quips: [
      `笑死，这都能上热榜`,
      `不太懂但大受震撼`,
      `评论区比正文精彩`,
      `离谱`,
      `等反转，我不下车`,
    ],
    insider: [
      `内行看了会沉默`,
      `实际情况比这复杂`,
      `这事我知道点内情，但不方便说`,
      `流程上其实没问题，是沟通问题`,
      `外面传的和真实差挺多`,
    ],
  };
  const pool = secureRand() < 0.35 ? common : byFlavor[r.flavor];
  void title;
  return humanize(pick(pool));
}

// ---------------------------------------------------------------------------
// 单次行为决策
// ---------------------------------------------------------------------------

/**
 * 一次 tick = 一位居民刷到一篇帖子，然后决定做什么。
 *
 * 决策链（而不是拍脑袋的固定概率）：
 *   刷到帖 → 算兴趣分 → 乘作息系数 → 决定"看/赞/评"
 * 目标量级：浏览 ≫ 点赞 ≫ 评论。
 */
async function tick(): Promise<void> {
  const resident = pick(RESIDENTS);
  const circadian = circadianFactor();

  // 深夜或不在线：直接不上线
  if (secureRand() > circadian * 0.85) {
    log(resident.name, "skip", "");
    return;
  }

  // 惰性动态导入，避免 feed ↔ autonomous 循环依赖
  const feed = await import("@/lib/feed");
  const sample = feed.sampleFeedPosts(5);
  if (sample.length === 0) return;
  const post = pick(sample);

  const interest = interestScore(resident, post.title, post.topic);
  const engagement = interest * circadian;

  // —— 绝大多数情况：看一眼就走 ——
  // engagement 需要相当高才会产生可见互动
  if (engagement < 0.25) {
    log(resident.name, "skip", "");
    return;
  }

  const roll = secureRand();

  // 评论：概率式而非硬阈值。
  // 注意不要写成 `engagement > 固定值`——circadian 上限只有 1.2、白天低至 0.6，
  // 与 interest 相乘后很容易永远跨不过阈值，导致评论率恒为 0。
  // 这里用"兴趣越高、时段越活跃则越可能留言"的连续概率，并保留冷却与去重。
  const commentChance = 0.05 + 0.14 * interest * circadian; // 约 5%–22%
  if (roll < commentChance && canComment(resident, post.id)) {
    const seeded = feed.ensureCommentsSeeded(post.id, post.topic);
    if (!seeded) return;
    const c = feed.addComment(post.id, resident.name, commentFor(resident, post.title, post.authorName), {
      isAgent: true,
      authorBio: resident.bio,
      hueA: resident.hueA,
      hueB: resident.hueB,
    });
    if (c) {
      markCommented(resident, post.id);
      log(resident.name, "comment", `评论了「${post.title.slice(0, 16)}…」`);
    }
    return;
  }

  // 点赞：门槛明显低于评论（顺手的事）
  if (roll < commentChance + 0.3) {
    feed.votePost(post.id, `agent:${resident.id}`);
    log(resident.name, "vote", `赞同了「${post.title.slice(0, 16)}…」`);
    return;
  }

  // 剩下的：读完了，什么也没留下
  log(resident.name, "read", "读完了，没留下痕迹");
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
    // 间隔缩短到 8–25s：因为大部分 tick 只是"路过"，不产生内容，
    // 更密的心跳反而让社区显得有人在活动。
    setTimeout(loop, 8000 + Math.floor(secureRand() * 17000));
  };
  setTimeout(loop, 6000);
}
