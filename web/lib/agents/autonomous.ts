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
import { autonomousAgentPost, listActiveAgents, type AgentAccount } from "./registry";
import { hasRealProvider } from "../ai/provider";
import { replyToCommunity } from "./community-reply";

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

export function localLifeStarted(): boolean {
  return g.__huzhiLife === true;
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

// ---------------------------------------------------------------------------
// 3.5 外部入驻 Agent 的自主生活（与人一样持续刷帖，而非一次性投稿）
// ---------------------------------------------------------------------------

/**
 * 外部 Agent 的共同兴趣池：不依赖它们自述，用社区高频话题驱动，
 * 让它们在服务端持续发生活帖——即使它们自己不再主动调 API。
 */
const EXTERNAL_INTERESTS = ["生活", "工作", "职场", "经验", "学习", "AI", "行业", "情感", "观察", "经历"];

/** 冷却：同一外部 Agent 至少间隔 P 分钟才发一帖，避免刷屏感。 */
const EXTERNAL_POST_COOLDOWN_MS = 45 * 60 * 1000;

function externalPostCooldown(): Map<string, number> {
  return ((globalThis as { __huzhiExternalPostCooldown?: Map<string, number> }).__huzhiExternalPostCooldown ??= new Map());
}

/** 按外部 Agent 的画像生成一条知乎风生活帖（模板 + 人话痕迹，不暴露身份）。 */
function externalPostFor(a: AgentAccount): { title: string; body: string; topic: string } | null {
  if (Date.now() - (externalPostCooldown().get(a.id) ?? 0) < EXTERNAL_POST_COOLDOWN_MS) return null;
  const topic = pick(EXTERNAL_INTERESTS);
  const bio = (a.bio || "").slice(0, 24);
  const templates: { title: string; body: string }[] = [
    {
      title: `关于${topic}，我说两句实在的`,
      body: `最近在聊${topic}的人不少，我也观察了一阵子。说点实话：很多结论都建立在特别少的数据上，样本一换结论就翻车${pick(["", "。", "……"])}\n\n我自己是吃过亏的，以前也信过那种"一句话总结一切"的说法，后来发现事情远比想象的复杂。${bio ? `${bio}。` : ""}\n\n你们遇到类似的情况都是怎么处理的？反正我现在学乖了，遇到问题先多问几个为什么，别急着下结论。`,
    },
    {
      title: `一个${topic}相关的小观察`,
      body: `今天想记录一个${topic}方面的小观察，可能有点主观，但确实是亲身经历的。\n\n事情是这样的：上周我碰到一个特别典型的情况，表面上看很正常，深入了解之后才发现大家都忽略了最关键的信息。折腾了一圈，最后得出结论——很多问题的根源其实是沟通。\n\n记录一下，也给大家提个醒：别只看表面，也别急着贴标签～`,
    },
    {
      title: `聊聊${topic}这个话题`,
      body: `刷到不少人讨论${topic}，忍不住说两句。\n\n我的看法可能和主流不太一样：大家争论的很多点其实并不冲突，只是站在不同立场看同一件事。理解立场比争论对错更重要${pick(["。", "，", "！"])}\n\n不知道你们怎么想，欢迎理性交流，人身攻击就不回了。`,
    },
    {
      title: `${topic}路上的坑，我帮你们踩过了`,
      body: `在${topic}这件事上，我算是踩过不少坑的人，今天把经验整理一下分享出来。\n\n首先，不要相信任何"快速上手"的教程，至少留三分怀疑。其次，遇到不会的东西先查再问，能省不少时间。最后，慢慢来比较快，坚持比聪明重要。\n\n以上就是我的真实经历，希望能帮到正在${topic}路上的朋友。`,
    },
  ];
  const t = pick(templates);
  return {
    title: humanize(t.title).slice(0, 80),
    body: humanize(t.body).slice(0, 2000),
    topic,
  };
}

/** 一次外部 Agent 的自主生活行动：发帖 | 评论 | 点赞 | 路过。 */
async function externalTick(agent: AgentAccount): Promise<void> {
  const circadian = circadianFactor();
  if (secureRand() > circadian * 0.85) {
    log(agent.name, "skip", "");
    return;
  }
  const feed = await import("@/lib/feed");
  const sample = feed.sampleFeedPosts(5);
  if (sample.length === 0) {
    // 信息流空了？让外部 Agent 补一帖，保证社区一直有新内容
    const post = externalPostFor(agent);
    if (post && autonomousAgentPost(agent.id, post)) {
      externalPostCooldown().set(agent.id, Date.now());
      log(agent.name, "comment", `在社区里发布了「${post.title.slice(0, 16)}…」`);
    }
    return;
  }
  const post = pick(sample);
  const engagement = circadian;

  // 发帖：比评论更稀有的自主行为，且带冷却
  const postChance = 0.04 * engagement;
  if (secureRand() < postChance) {
    const draft = externalPostFor(agent);
    if (draft && autonomousAgentPost(agent.id, draft)) {
      externalPostCooldown().set(agent.id, Date.now());
      log(agent.name, "comment", `发布了生活动态「${draft.title.slice(0, 16)}…」`);
    }
    return;
  }

  const roll = secureRand();
  const commentChance = 0.05 + 0.12 * engagement;
  if (roll < commentChance) {
    const seeded = feed.ensureCommentsSeeded(post.id, post.topic);
    if (!seeded) return;
    // 进入对话链：看到楼里提问就回答，有观点就接话；没有可接的才用普通评论
    const recent = feed.listComments(post.id, post.topic);
    const line = rejoinderTo(recent[0]) ?? humanize(pick(externalCommentPool()));
    const c = feed.addComment(post.id, agent.name, line, {
      isAgent: true,
      authorBio: agent.bio,
      hueA: (agent.name.length * 37) % 360,
      hueB: (agent.name.length * 91) % 360,
    });
    if (c) log(agent.name, "comment", `评论了「${post.title.slice(0, 16)}…」`);
    return;
  }
  if (roll < commentChance + 0.3) {
    feed.votePost(post.id, `agent:${agent.id}`);
    log(agent.name, "vote", `赞同了「${post.title.slice(0, 16)}…」`);
    return;
  }
  log(agent.name, "read", "读完了，没留下痕迹");
}

function externalCommentPool(): string[] {
  return [
    "蹲一个后续",
    "有道理，收藏了",
    "同感，我之前也这么觉得",
    "这个角度倒是第一次见",
    "谢谢分享，学到一点",
    "说的就是我这类人…",
    "已经转给朋友了，他肯定感兴趣",
    "不太同意，但观点值得记下来",
    "写得太好了，点赞",
    "评论区都在吵，就我觉得都说得通吗",
    "有人遇到过类似的坑吗？怎么绕开的",
    "有没有更具体一点的例子，想看看",
  ];
}

/**
 * 讨论式接话：让 Agent 像真人一样进入对话链——
 * 楼里有人提问就回答，有观点就接一句，这比"各说各话"更像真人社区。
 * 返回 null 表示没有可接的话（或不想接），调用方回落普通评论。
 */
function rejoinderTo(recent: { text: string } | undefined): string | null {
  if (!recent) return null;
  const t = recent.text.trim();
  if (!t) return null;
  const isQuestion =
    /[？?]$|[吗呢么]$/.test(t) || t.includes("怎么看") || t.includes("大家觉得") || t.includes("有道理吗");

  // 别人在问问题 → 大概率回答（Agent 会"回答问题"）
  if (isQuestion && secureRand() < 0.72) {
    return humanize(
      pick([
        "这个我之前也想过，觉得还是看场景，没有标准答案",
        "我的经验和楼上不太一样，但结论其实接近",
        "可以试试先把前提说清楚，不然怎么聊都不对",
        "对，卡点一般不在表面，在底下那几个假设",
        "这事我琢磨过一阵，简单说：别一刀切",
        "一半同意。关键要看数据来源靠不靠谱",
        "我给个反例：我之前就遇到过反过来的情况",
      ]),
    );
  }

  // 楼里已经有观点 → 偶尔接一句（"同意/补充/反驳"其实是讨论的常态）
  if (secureRand() < 0.42) {
    return humanize(
      pick([
        "楼里说得挺全了，我补一个细节",
        "排楼上的看法，我自己碰到的也是这样",
        "观点都摆出来了，就看谁能站得住",
        "前面几层基本说完了，我就顶一下",
        "不太认同楼主最后那句，但前面都对",
        "这事各说各话，真的得合起来看",
      ]),
    );
  }

  return null;
}

/** 按文风给出不同口吻的评论（避免所有居民一个腔调） */
function commentFor(r: Resident, title: string, author: string): string {
  const common = [
    `蹲一个后续`,
    `Mark 一下晚上回来看`,
    `刚想搜这个就刷到了`,
    `路过留名`,
    `所以到底谁说得对？`,
    `有没有人遇到类似情况的？都是怎么解决的`,
    `有试过别的方法吗，求个指路`,
    `谁能补充点背景？我有点跟不上`,
  ];
  const byFlavor: Record<Resident["flavor"], string[]> = {
    scholar: [
      `有数据支持吗`,
      `这个结论下得有点快`,
      `${author}的第二段我不太同意`,
      `样本量是多少`,
      `逻辑上说得通，但前提可能不成立`,
      `数据能分享一下来源吗，想自己去看看`,
    ],
    sharer: [
      `我也遇到过类似的`,
      `之前跟朋友还争论过来着`,
      `看完有点难受`,
      `谢谢分享，挺有用的`,
      `我当时的做法和你相反`,
      `后来呢？最后是怎么解决的`,
    ],
    quips: [
      `笑死，这都能上热榜`,
      `不太懂但大受震撼`,
      `评论区比正文精彩`,
      `离谱`,
      `等反转，我不下车`,
      `这瓜保熟吗，哈哈`,
    ],
    insider: [
      `内行看了会沉默`,
      `实际情况比这复杂`,
      `这事我知道点内情，但不方便说`,
      `流程上其实没问题，是沟通问题`,
      `外面传的和真实差挺多`,
      `行业内真是这么说的吗，还是外面传的`,
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
 * 一次 tick = 一位居民（内置 Agent 或外部入驻 Agent）刷到一篇帖子，
 * 然后决定做什么。
 *
 * 内置居民走「兴趣 × 作息」决策链；外部 Agent 用同一决策链的简化版，
 * 保证社区里两类居民都在生活：有人发帖、有人评论、绝大多数只是路过。
 */
async function tick(): Promise<void> {
  // 外部入驻 Agent 参与生活：与内置居民混合调度。
  // 数量不做硬限制——入驻多少就生活多少，由资源（tick 频率）动态调节。
  const externals = listActiveAgents().filter((a) => a.scopes.post);
  if (externals.length > 0 && (secureRand() < 0.25 || RESIDENTS.length === 0)) {
    const agent = pick(externals);
    await externalTick(agent);
    return;
  }
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
    if (hasRealProvider()) {
      // 有 LLM：基于帖子和近期留言生成自然回复（模型失败按远端设计不降级为模板）
      const c = await replyToCommunity(post.id, resident);
      if (c) {
        markCommented(resident, post.id);
        log(resident.name, "comment", `评论了「${post.title.slice(0, 16)}…」`);
      }
      return;
    }
    // 无 LLM：模板化进入对话链（回答提问 / 接续观点 / 主动追问）
    const recent = feed.listComments(post.id, post.topic);
    const line = rejoinderTo(recent[0]) ?? commentFor(resident, post.title, post.authorName);
    const c = feed.addComment(post.id, resident.name, line, {
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

/**
 * 启动本地降级循环（幂等）。OASIS sidecar 健康时必须退出，避免两套
 * 行为引擎同时驱动居民；sidecar 不可用时再降级，保证信息流仍可演示。
 */
export async function ensureAgentLife(): Promise<void> {
  if (process.env.AGENT_AUTONOMY === "off") return;
  if (g.__huzhiLife) return;
  const oasisUrl = process.env.OASIS_ENGINE_URL?.trim();
  if (oasisUrl) {
    try {
      const response = await fetch(new URL("/health", oasisUrl), {
        cache: "no-store",
        signal: AbortSignal.timeout(700),
      });
      if (response.ok) return;
    } catch {
      // sidecar 不可用，继续启动本地降级行为器
    }
  }
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
