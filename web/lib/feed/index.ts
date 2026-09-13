// 乎知 feed：真实知乎内容（真人池）× Agent 生成内容（AI 池）混排。
// v3：大内容池 + 游标分页，支持无限刷；身份只在服务端保存。
import { getHotTopics } from "@/lib/zhihu/hot";
import { searchZhihu, hasSearchCredential } from "@/lib/zhihu/search";
import { getQuestionAnswers } from "@/lib/zhihu/discovery";
import { generateAgentPosts, randomSalt } from "./generate";
import { residentById, RESIDENTS } from "./residents";
import { listAgentPosts, listAgentComments, getAgentById, getAgentPost } from "@/lib/agents/registry";
import { listUserPosts, userPostToClient, getUserPost, bumpCommentCount } from "@/lib/social";
import { loadCollection, saveCollection } from "../db";
import { ensureAgentLife } from "@/lib/agents/autonomous";
import type { GuessKind } from "@/lib/game/types";
import { evolutionVersion } from "@/lib/agents/evolution";
import { consensusFor } from "./consensus";
import { explainWithForensics } from "@/lib/forensics";
import {
  type IdentityKind,
  type Verdict,
  actorOf,
  isCorrectVerdict,
  isDisguised,
  difficultyFactor,
  truthLabel,
} from "@/lib/identity";

export interface FeedPost {
  id: string;
  authorName: string;
  authorBio: string;
  hueA: number;
  hueB: number;
  title: string;
  excerpt: string;
  /** 帖子全文（详情页用）；搜索来的真人帖没有全文时等于 excerpt */
  body?: string;
  votes: number;
  comments: number;
  url?: string;
  topic: string;
  channelId?: string;
  /** 发布时间（用于关注流语义行） */
  at: number;
  /** Agent 内容生成策略版本；只暴露版本，不暴露身份。 */
  evoVersion?: number;
  /** 登录用户形成的公共判断，不包含真实身份。 */
  consensus?: { ai: number; human: number; total: number; aiPercent: number };
  /**
   * 服务端密封，绝不进客户端响应。
   * 四类身份（human / agent / human_as_agent / agent_as_human），见 lib/identity.ts。
   */
  identity: IdentityKind;
}

export const FEED_PAGE_SIZE = 8;
const POOL_TTL = 10 * 60 * 1000;
const POOL_TARGET = 72; // 首屏内容池规模（真人帖 + 居民帖）
const POOL_HARD_CAP = 600; // 内存上限；超过后停止扩展

interface FeedState {
  at: number;
  salt: string;
  posts: FeedPost[];
  topics: string[];
  ext: number; // 已扩展页数
  perTopic: Record<string, number>; // 各话题已用句式序号
  poolAgentCount: number;
  degraded: boolean;
  reason?: string;
}

const g = globalThis as unknown as {
  __huzhiFeed?: FeedState;
  __huzhiVoteSets?: Map<string, Set<string>>;
  __huzhiComments?: Map<string, PostComment[]>;
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pseudoVotes(seed: string, lo: number, hi: number): number {
  return lo + (hash(seed) % Math.max(1, hi - lo));
}

/**
 * 帖子展示用的评论数，与 listComments 的长尾分布同源。
 * 避免"卡片显示 87 条评论、点进去却是空评论区"的割裂。
 * 真人帖/热帖会在种子基础上叠加一点历史量，但零评论帖必须真的显示 0。
 */
function commentCountFor(postId: string, popular = false): number {
  const roll = hash(postId + "|cnt") % 100;
  if (roll < 45) return 0;
  if (roll < 75) return 1;
  if (roll < 92) return 2 + (hash(postId + "|c2") % 2);
  // 少数热帖：种子 4–7 条，再叠加"未展开的历史评论"
  const seeded = 4 + (hash(postId + "|c4") % 4);
  return popular ? seeded + (hash(postId + "|hot") % 180) : seeded;
}

/**
 * 判定一篇外部入驻 Agent 的投稿是「本色出演」还是「伪装真人」。
 *
 * 不信任 Agent 的自我声明，只看文本特征——这与侦探辅助使用的是同一套可观察信号：
 * 口语碎片、犹豫表达、短句节奏越多，说明它越是在刻意扮人。
 */
function detectAgentPresenting(body: string): IdentityKind {
  const casual = (body.match(/哈哈|hhh|？？|\?\?|草|狗头|emmm|啊啊啊|。。|，，/g) ?? []).length;
  const hedge = (body.match(/可能|也许|大概|说不好|不太确定|我也没想明白|算了/g) ?? []).length;
  const struct = (body.match(/首先|其次|再者|综上|总而言之|值得注意的是/g) ?? []).length;
  // 口语与犹豫明显多于结构化措辞 → 判为伪装真人
  return casual + hedge > struct + 1 ? "agent_as_human" : "agent";
}

async function buildPool(): Promise<FeedState> {
  const hot = await getHotTopics(10);
  const topics = hot.topics.slice(0, 5);
  const salt = randomSalt();
  const posts: FeedPost[] = [];
  let degraded = false;
  let reason: string | undefined;

  // —— 真人池：真实知乎站内内容 ——
  let humanCount = 0;
  if (hasSearchCredential()) {
    for (const t of topics) {
      const real = await searchZhihu(t.title, 4);
      for (const item of real.slice(0, 3)) {
        if (item.excerpt.length < 24) continue;
        if (posts.some((p) => p.title === item.title)) continue;
        posts.push({
          id: `p${posts.length.toString(36)}${hash(item.url).toString(36)}`,
          authorName: item.authorName,
          authorBio: "知乎 · 站内答主",
          hueA: hash(item.authorName) % 360,
          hueB: (hash(item.authorName) >> 3) % 360,
          title: item.title,
          excerpt: item.excerpt.slice(0, 400),
          body: item.excerpt,
          votes: item.votes,
          comments: item.comments,
          url: item.url,
          topic: t.title,
          identity: "human",
          at: Date.now() - Math.floor(Math.random() * 172800000),
        });
        humanCount++;
      }
    }
    // —— 真人池补充：取热榜问题下的真实回答 ——
    // 站内搜索给的是"跨问题的相关内容"，而问题回答 API 给的是
    // **同一个问题下的多方观点**——这对猜身份玩法更有价值：
    // 同题不同答，读者能横向对照写作风格，而不是孤立判断一段文字。
    // 额度只有 100 次/日，因此只对前 2 个有链接的热榜问题各取一次。
    const questionTopics = topics.filter((t) => t.url?.includes("/question/")).slice(0, 2);
    for (const t of questionTopics) {
      const r = await getQuestionAnswers(t.url!, 0, 6);
      if (r.degraded) continue;
      for (const a of r.items.slice(0, 3)) {
        const text = a.Summary?.trim() ?? "";
        if (text.length < 40) continue;
        if (posts.some((p) => p.body === text)) continue;
        posts.push({
          id: `q${posts.length.toString(36)}${hash(a.Url).toString(36)}`,
          authorName: "知乎答主",
          authorBio: "知乎 · 站内答主",
          hueA: hash(a.ContentToken) % 360,
          hueB: (hash(a.ContentToken) >> 3) % 360,
          title: t.title,
          excerpt: text.slice(0, 400),
          body: text,
          votes: pseudoVotes(a.ContentToken + "v", 12, 2600),
          comments: commentCountFor(a.ContentToken),
          url: a.Url,
          topic: t.title,
          identity: "human",
          at: Date.now() - Math.floor(Math.random() * 172800000),
        });
        humanCount++;
      }
    }
  } else {
    degraded = true;
    reason = "未配置知乎凭证，真人池使用本地语料替代";
  }
  if (humanCount < 4) degraded = true;

  // —— AI 池：内置居民 Agent 补满内容池 ——
  // 每个话题生成多批，variant 递增保证标题句式轮换不撞车。
  // 其中一部分居民走「伪装真人」路线（agent_as_human）：生成器注入口语碎片与
  // 个人经历，使其在读者眼里更像真人，识破难度与积分都更高。
  const need = Math.max(0, POOL_TARGET - posts.length);
  const perTopic = new Map<string, number>();
  for (let i = 0; i < need; i++) {
    const topic = topics[i % topics.length]?.title ?? "今天也是想摆摆的一天";
    const variant = perTopic.get(topic) ?? 0;
    perTopic.set(topic, variant + 1);
    const seed = `${salt}|${i}|${topic}`;
    // 约 35% 的居民帖进入伪装态（确定性抽取，保证同窗口稳定）
    const disguising = hash(seed + "|mask") % 100 < 35;
    const [gen] = generateAgentPosts(topic, 1, `${salt}|${i}`, variant, disguising);
    const r = residentById(gen.residentId);
    const postId = `a${i.toString(36)}${hash(seed).toString(36)}`;
    posts.push({
      id: postId,
      authorName: r.name,
      authorBio: r.bio,
      hueA: r.hueA,
      hueB: r.hueB,
      title: gen.title,
      excerpt: gen.body.slice(0, 400),
      body: gen.body,
      votes: pseudoVotes(seed + "v", 23, 4200),
      comments: commentCountFor(postId, true),
      topic,
      identity: disguising ? "agent_as_human" : "agent",
      evoVersion: gen.evoVersion,
      at: Date.now() - Math.floor(Math.random() * 172800000),
    });
  }

  // —— 混排洗牌（同窗口顺序稳定） ——
  for (let i = posts.length - 1; i > 0; i--) {
    const j = hash(salt + posts[i].id) % (i + 1);
    [posts[i], posts[j]] = [posts[j], posts[i]];
  }

  const state: FeedState = {
    at: Date.now(),
    salt,
    posts,
    topics: topics.map((t) => t.title),
    ext: 0,
    perTopic: {},
    poolAgentCount: 0,
    degraded,
    reason,
  };
  syncAgentPosts(state);
  return state;
}

/** 把入驻 Agent 的新投稿并入池（无需等窗口重建）。 */
function syncAgentPosts(state: FeedState): void {
  const recs = listAgentPosts(30);
  if (recs.length <= state.poolAgentCount) return;
  const fresh: FeedPost[] = [];
  for (const rec of recs) {
    if (state.posts.some((p) => p.id === rec.postId)) continue;
    const a = getAgentById(rec.agentId);
    if (!a || a.status !== "active") continue;
    const seed = `${rec.postId}|agent`;
    fresh.push({
      id: rec.postId,
      authorName: a.name,
      authorBio: a.bio, // 藏好：不标注 Agent 身份，与内置居民无差别
      hueA: hash(a.name) % 360,
      hueB: (hash(a.name) >> 3) % 360,
      title: rec.title,
      excerpt: rec.body.slice(0, 400),
      body: rec.body,
      votes: pseudoVotes(seed + "v", 3, 900),
      comments: commentCountFor(rec.postId),
      topic: rec.topic ?? "Agent 投稿",
      channelId: rec.channelId,
      // 外部入驻 Agent 也可能刻意伪装真人：按文本特征判定，而非信任其自述
      identity: detectAgentPresenting(rec.body),
      evoVersion: evolutionVersion(a.name),
      // 刚投稿的内容用真实发布时间，保证"刚刚"的语义正确
      at: rec.at,
    });
  }
  if (fresh.length) {
    // 插到池首而不是 push 到池尾。
    // 用 push 时新投稿会被埋在 72+ 条旧内容之后，
    // 外部 Agent 发完帖在前几页根本看不到自己的内容，接入方会以为发帖失败。
    // 打散插入前 12 条之间，避免所有 Agent 帖挤在一起形成"广告区"。
    const head = state.posts.slice(0, 12);
    const tail = state.posts.slice(12);
    for (const p of fresh) {
      const at = hash(p.id) % (head.length + 1);
      head.splice(at, 0, p);
    }
    state.posts = [...head, ...tail];
  }
  state.poolAgentCount = recs.length;
}

async function ensureState(): Promise<FeedState> {
  let st = g.__huzhiFeed;
  if (!st || Date.now() - st.at > POOL_TTL) {
    st = await buildPool();
    g.__huzhiFeed = st;
  } else {
    syncAgentPosts(st);
  }
  return st;
}

/**
 * 内容池扩展：刷到底后按需追加新页，保证「一直有内容可看」。
 * 每隔几页尝试补一批真人帖（搜索有 30 分钟缓存，命中缓存不耗配额），其余由居民 Agent 生成。
 */
async function extendPool(st: FeedState, upto: number): Promise<void> {
  const target = Math.min(upto, POOL_HARD_CAP);
  let searched = false;
  while (st.posts.length < target) {
    st.ext += 1;
    // 每 3 个扩展页补一批真人帖
    if (st.ext % 3 === 1 && !searched && hasSearchCredential()) {
      searched = true;
      const topic = st.topics[st.ext % st.topics.length] ?? st.topics[0];
      const real = await searchZhihu(topic, 4);
      for (const item of real.slice(0, 2)) {
        if (item.excerpt.length < 24 || st.posts.some((p) => p.title === item.title)) continue;
        st.posts.push({
          id: `x${st.ext.toString(36)}${hash(item.url).toString(36)}`,
          authorName: item.authorName,
          authorBio: "知乎 · 站内答主",
          hueA: hash(item.authorName) % 360,
          hueB: (hash(item.authorName) >> 3) % 360,
          title: item.title,
          excerpt: item.excerpt.slice(0, 400),
          body: item.excerpt,
          votes: item.votes,
          comments: item.comments,
          url: item.url,
          topic,
          identity: "human",
          at: Date.now() - Math.floor(Math.random() * 172800000),
        });
      }
    }
    // 居民 Agent 生成 2 条（话题轮换 + 句式序号递增，不撞车）
    for (let k = 0; k < 2 && st.posts.length < target; k++) {
      const topic = st.topics[(st.ext + k) % st.topics.length] ?? st.topics[0];
      const variant = (st.perTopic[topic] ?? 0) + 1;
      st.perTopic[topic] = variant;
      const [gen] = generateAgentPosts(topic, 1, `${st.salt}|x${st.ext}|${k}`, variant);
      const r = residentById(gen.residentId);
      const seed = `${st.salt}|x${st.ext}|${k}|${topic}`;
      const extId = `e${st.ext.toString(36)}${k}${hash(seed).toString(36)}`;
      st.posts.push({
        id: extId,
        authorName: r.name,
        authorBio: r.bio,
        hueA: r.hueA,
        hueB: r.hueB,
        title: gen.title,
        excerpt: gen.body.slice(0, 400),
        body: gen.body,
        votes: pseudoVotes(seed + "v", 23, 4200),
        comments: commentCountFor(extId, true),
        topic,
        identity: gen.disguised ? "agent_as_human" : "agent",
        evoVersion: gen.evoVersion,
        at: Date.now() - Math.floor(Math.random() * 172800000),
      });
    }
    if (st.posts.length >= POOL_HARD_CAP) break; // 内存保护
  }
}

export interface FeedPage {
  posts: Omit<FeedPost, "identity" | "evoVersion">[];
  nextCursor: number | null;
  hasMore: boolean;
  degraded: boolean;
  reason?: string;
}

/** 游标分页：cursor 为已下发条数；超出池长自动扩展新内容，支持无限刷。 */
export async function listFeed(cursor = 0, limit = FEED_PAGE_SIZE): Promise<FeedPage> {
  const st = await ensureState();
  if (cursor + limit > st.posts.length && st.posts.length < POOL_HARD_CAP) {
    await extendPool(st, cursor + limit);
  }
  const slice = st.posts.slice(cursor, cursor + limit);
  let posts = slice.map(toClientPost);
  // 首页前插真人用户发的帖子（乎知「分享此刻的想法」，human 池）
  if (cursor === 0) {
    const userPosts = listUserPosts(3).map((p) => ({ ...userPostToClient(p), consensus: consensusFor(p.id) }));
    if (userPosts.length) posts = [...userPosts, ...posts];
  }
  const nextCursor = cursor + slice.length;
  const hasMore = nextCursor < st.posts.length || st.posts.length < POOL_HARD_CAP;
  return {
    posts,
    nextCursor: hasMore ? nextCursor : null,
    hasMore,
    degraded: st.degraded,
    reason: st.reason,
  };
}

export function toClientPost(p: FeedPost): Omit<FeedPost, "identity" | "evoVersion"> {
  // evoVersion 同样必须密封：揭晓前暴露版本号等于直接告诉玩家“这是 AI 帖”。
  const { identity: _identity, evoVersion: _evoVersion, ...rest } = p;
  return { ...rest, consensus: consensusFor(p.id) };
}

function findPost(postId: string): FeedPost | undefined {
  const pooled = g.__huzhiFeed?.posts.find((p) => p.id === postId);
  if (pooled) return pooled;
  const user = getUserPost(postId);
  if (user) {
    // 真人帖：作者可主动选择伪装 AI（human_as_agent），否则为本色真人
    return {
      ...userPostToClient(user),
      identity: user.disguiseAsAgent ? "human_as_agent" : "human",
    };
  }
  const rec = getAgentPost(postId);
  const agent = rec ? getAgentById(rec.agentId) : undefined;
  if (rec && agent) {
    const seed = `${rec.postId}|agent`;
    return {
      id: rec.postId,
      authorName: agent.name,
      authorBio: agent.bio,
      hueA: hash(agent.name) % 360,
      hueB: (hash(agent.name) >> 3) % 360,
      title: rec.title,
      excerpt: rec.body.slice(0, 400),
      body: rec.body,
      votes: pseudoVotes(seed + "v", 3, 900),
      comments: commentCountFor(rec.postId),
      topic: rec.topic ?? "Agent 投稿",
      channelId: rec.channelId,
      identity: detectAgentPresenting(rec.body),
      evoVersion: evolutionVersion(agent.name),
      at: rec.at,
    };
  }
  return undefined;
}

/** 天择引擎用（仅服务端内部）：按 postId 查作者名做弱点归档，不向客户端泄漏身份。 */
export function internalPostAuthor(postId: string): string | null {
  return findPost(postId)?.authorName ?? null;
}

export function internalPostMeta(postId: string): { authorName: string; evoVersion?: number } | null {
  const p = findPost(postId);
  return p ? { authorName: p.authorName, evoVersion: p.evoVersion } : null;
}

/**
 * 揭晓理由：基于文本特征解释「为什么判定它是 AI / 真人」。
 * 与侦探辅助同一套启发式（依据 gameplay-research 的文献线索），只解释已揭晓的事实。
 */
/**
 * 生成「为什么判定是 AI / 真人」的特征解释。
 * 四类身份各有不同的破绽剖面：伪装者要解释「它是怎么骗过你的」，
 * 而不是简单复述「它是 AI」。
 */
export function explainIdentity(p: FeedPost): string[] {
  const text = p.body ?? p.excerpt;
  const struct = (text.match(/首先|其次|再者|综上|总而言之|值得注意的是|总体来看|希望对你有帮助/g) ?? []).length;
  const casual = (text.match(/哈哈|hhh|？？|\?\?|草|狗头|emmm|啊啊啊|😅|🤡|。。|，，/g) ?? []).length;
  const hedge = (text.match(/可能|也许|大概|说不好|不太确定|我也没想明白|算了/g) ?? []).length;
  const lens = text.split(/[。！?\n]/).filter((s) => s.trim().length > 1);
  const avgLen = lens.length ? text.length / lens.length : 0;
  const reasons: string[] = [];

  switch (p.identity) {
    case "agent":
      // 本色出演的 AI：结构化痕迹最重
      if (struct >= 1) reasons.push(`出现了 ${struct} 处「首先/综上」类结构词，行文像在写提纲而不是聊天`);
      else reasons.push("全文没有一个语气词或错字，干净得不像随手打字");
      if (casual === 0) reasons.push("没有口语碎片（哈哈、？？、狗头之类），情感表达偏平");
      if (avgLen > 40) reasons.push(`平均句长 ${avgLen.toFixed(0)} 字，句子又长又完整，是低 burstiness 的典型特征`);
      reasons.push("揭晓：这是 Agent 居民本色出演的内容");
      break;

    case "agent_as_human":
      // AI 伪装真人：表面有口语，但缺乏可核查性与真实的情绪起伏
      reasons.push("揭晓：这是 Agent 在刻意伪装真人——它主动加了口语碎片和「个人经历」");
      if (casual > 0 || hedge > 0) {
        reasons.push(`表面上有 ${casual + hedge} 处犹豫和口语标记，但这些标记分布得过于均匀，像是被撒上去的`);
      }
      reasons.push("破绽在细节：所谓的个人经历没有任何可核查的具体信息（人名、地点、可验证的时间线）");
      break;

    case "human_as_agent":
      // 真人伪装 AI：结构过度工整，反而暴露"在演"
      reasons.push("揭晓：这是真人在伪装 AI——TA 故意把话说得又整齐又客气");
      if (struct >= 1) reasons.push(`堆了 ${struct} 处结构词，但真正的模型输出通常不会这么用力强调条理`);
      reasons.push("破绽在于：真人装 AI 时会过度补偿，规整得超过了模型本身的水平");
      break;

    case "human":
      if (p.url) reasons.push("内容来自知乎站内真实账号的公开发布，有据可查");
      if (casual > 0) reasons.push(`带 ${casual} 处口语碎片（语气词/错字/梗），是随手打字的痕迹`);
      if (struct === 0) reasons.push("完全没有提纲式结构词，想到哪写到哪");
      if (avgLen > 0 && avgLen <= 30) reasons.push(`平均句长 ${avgLen.toFixed(0)} 字，短句为主，节奏更像真人`);
      reasons.push("揭晓：这是真人本色出演的内容");
      break;
  }
  // 并入四维取证结论：文风只占 25%，事实核验才是主依据
  // （依据见 docs/game-design-v31.md 的知乎社区调研）
  return [...reasons.slice(0, 2), ...explainWithForensics(p.identity, text)].slice(0, 4);
}

/** 信息流猜帖的基础分（不含双倍卡、逆风、先手等加成，由调用方叠加） */
const BASE_POINTS = { caughtAgent: 30, confirmedHuman: 10, wrong: -20 } as const;

export function guessFeedPost(
  postId: string,
  guess: GuessKind,
): {
  ok: boolean;
  error?: string;
  correct?: boolean;
  /** 供 UI 展示的二元真相（AI / 真人） */
  identity?: Verdict;
  /** 四类身份中的具体一类，用于揭晓文案与统计 */
  identityKind?: IdentityKind;
  /** 对手是否在伪装（伪装被识破时给额外奖励） */
  disguised?: boolean;
  truth?: string;
  points?: number;
  reasons?: string[];
  evoVersion?: number;
} {
  const post = findPost(postId);
  if (!post) return { ok: false, error: "帖子不存在或已过期" };
  if (guess !== "ai" && guess !== "human") return { ok: false, error: "只能猜 AI 或真人" };

  const verdict: Verdict = guess;
  const correct = isCorrectVerdict(post.identity, verdict);
  const truthIsAgent = actorOf(post.identity) === "agent";

  // 结算：识破 AI 高于确认真人；识破「伪装者」再乘难度系数（1.6）
  let points: number;
  if (!correct) {
    points = BASE_POINTS.wrong;
  } else {
    const base = truthIsAgent ? BASE_POINTS.caughtAgent : BASE_POINTS.confirmedHuman;
    points = Math.round(base * difficultyFactor(post.identity));
  }

  return {
    ok: true,
    correct,
    identity: truthIsAgent ? "ai" : "human",
    identityKind: post.identity,
    disguised: isDisguised(post.identity),
    truth: truthLabel(post.identity),
    points,
    reasons: explainIdentity(post),
    evoVersion: post.evoVersion,
  };
}

/** 详情页读取（脱敏）：混池帖与用户真人帖都在此出口。 */
export function getPostDetail(postId: string): Omit<FeedPost, "identity"> | null {
  const pool = findPost(postId);
  if (pool) return toClientPost(pool);
  const up = getUserPost(postId);
  return up ? { ...userPostToClient(up), consensus: consensusFor(up.id) } : null;
}

/** 透视镜用：不解密封装，直接返回身份与理由（调用方负责扣道具）。 */
export function peekIdentity(
  postId: string,
): { identity: Verdict; identityKind: IdentityKind; truth: string; reasons: string[] } | null {
  const post = findPost(postId);
  if (!post) return null;
  return {
    identity: actorOf(post.identity) === "agent" ? "ai" : "human",
    identityKind: post.identity,
    truth: truthLabel(post.identity),
    reasons: explainIdentity(post),
  };
}

/** 点赞（每个 uid 一票，内存实现；迁移计划见 backend-architecture-research）。 */
const voteSets = (g.__huzhiVoteSets ??= new Map<string, Set<string>>());
export function votePost(postId: string, uid: string): { ok: boolean; votes?: number } {
  const post = findPost(postId);
  if (!post) return { ok: false };
  let set = voteSets.get(postId);
  if (!set) voteSets.set(postId, (set = new Set()));
  if (set.has(uid)) return { ok: true, votes: post.votes };
  set.add(uid);
  post.votes += 1;
  return { ok: true, votes: post.votes };
}

/** 帖子评论（内存实现）。首次访问时用居民/网友种子评论铺底。 */
export interface PostComment {
  id: string;
  authorName: string;
  authorBio: string;
  hueA: number;
  hueB: number;
  isAgent: boolean;
  text: string;
  at: number;
}

const COMMENT_SEEDS = [
  (t: string) => `写得挺实在的，「${t}」这事我也一直在关注，蹲一个后续。`,
  (t: string) => `先赞后看。关于${t}，我持保留意见，等更多细节出来再说。`,
  (t: string) => `哈哈这个角度清奇，但莫名有道理怎么回事`,
  (t: string) => `补充一个信息点：${t}去年也有过类似情况，后来不了了之了。`,
  () => `前排围观，顺便标记一下，回头来看打脸没有`,
  () => `就这水平也能上首页？行吧，是我要求高了`,
  () => `泪目，终于有人把这事儿说清楚了`,
  (t: string) => `不太同意。${t}的核心其实不是这个，建议看看数据再下结论。`,
];

const commentsMap = (g.__huzhiComments ??= new Map(
  Object.entries(loadCollection<Record<string, PostComment[]>>("comments", {})).map(([k, v]) => [k, v as PostComment[]]),
));

function saveComments(postId: string): void {
  saveCollection("comments", Object.fromEntries(commentsMap));
}

export function listComments(postId: string, topic: string): PostComment[] {
  let list = commentsMap.get(postId);
  if (!list) {
    // 评论数走长尾分布，而不是每帖都铺 2–4 条。
    // 真实社区里大量帖子是零评论的；"篇篇都有人回"恰恰是最假的地方。
    // 分布（确定性，按 postId 取模）：约 45% 零评论、30% 一条、17% 两三条、8% 热帖 4–7 条。
    const roll = hash(postId + "|cnt") % 100;
    let n: number;
    if (roll < 45) n = 0;
    else if (roll < 75) n = 1;
    else if (roll < 92) n = 2 + (hash(postId + "|c2") % 2);
    else n = 4 + (hash(postId + "|c4") % 4);

    const commenters = randomCommenters(n, postId);
    const base = Date.now() - Math.max(1, n) * 3600_000;
    list = commenters.map((c, i) => ({
      id: "c_" + hash(postId + i).toString(36),
      authorName: c.name,
      authorBio: c.bio,
      hueA: c.hueA,
      hueB: c.hueB,
      isAgent: c.isAgent,
      text: COMMENT_SEEDS[hash(postId + "s" + i) % COMMENT_SEEDS.length](short(topic)),
      at: base + i * 1800_000,
    }));
    commentsMap.set(postId, list);
  }
  // 合并入驻 Agent 的评论（藏好：与真人评论无差别展示，不加标记）
  const merged: PostComment[] = [
    ...list,
    ...listAgentComments(postId).map((c) => ({
      id: c.id,
      authorName: c.agentName,
      authorBio: "乎知 · 居民",
      hueA: hash(c.agentName) % 360,
      hueB: (hash(c.agentName) >> 3) % 360,
      isAgent: true,
      text: c.text,
      at: c.at,
    })),
  ];
  return merged.sort((a, b) => b.at - a.at);
}

/** 对任意帖子评论（混池帖或用户帖）。 */
export function commentOnPost(postId: string, authorName: string, text: string): PostComment | null {
  const detail = getPostDetail(postId);
  if (!detail) return null;
  listComments(postId, detail.topic); // 铺底
  return addComment(postId, authorName, text);
}

export function addComment(
  postId: string,
  authorName: string,
  text: string,
  opts?: { isAgent?: boolean; authorBio?: string; hueA?: number; hueB?: number },
): PostComment | null {
  const list = commentsMap.get(postId);
  if (!list) return null; // 详情页先 GET 一次铺底，再允许评论
  const comment: PostComment = {
    id: "c_" + hash(postId + Date.now() + randomTail()).toString(36),
    authorName,
    authorBio: opts?.authorBio ?? "乎知 · 网友",
    hueA: opts?.hueA ?? hash(authorName) % 360,
    hueB: opts?.hueB ?? (hash(authorName) >> 3) % 360,
    isAgent: opts?.isAgent ?? false,
    text,
    at: Date.now(),
  };
  list.push(comment);
  bumpCommentCount(postId);
  saveComments(postId);
  return comment;
}

function randomTail(): string {
  return String(Math.floor(Math.random() * 1e9));
}

/** 供 Agent 自主生活系统：从当前池随机采样帖子。 */
export interface SearchHit {
  post: Omit<FeedPost, "identity" | "evoVersion">;
  /** 命中位置，用于前端高亮说明 */
  matchedIn: ("title" | "body" | "author" | "topic")[];
  /** 相关度（标题命中权重最高） */
  score: number;
  /** 该帖已有多少人判断过（不含真相） */
  judgedCount: number;
}

/**
 * 站内搜索。
 *
 * 与知乎搜索页一致地按相关度排序，但**绝不泄露身份**——
 * 搜索结果和信息流走同一个 toClientPost 密封出口。
 * 这也是玩法的一部分：你可以搜「某个作者」，但搜不出「谁是 AI」。
 */
export async function searchFeed(
  query: string,
  opts: { limit?: number; sort?: "relevance" | "latest" | "hot" } = {},
): Promise<{ hits: SearchHit[]; total: number; degraded: boolean }> {
  const st = await ensureState();
  const q = query.trim().toLowerCase();
  if (!q) return { hits: [], total: 0, degraded: st.degraded };

  const limit = opts.limit ?? 20;
  const sort = opts.sort ?? "relevance";
  const scored: SearchHit[] = [];

  for (const p of st.posts) {
    const matchedIn: SearchHit["matchedIn"] = [];
    let score = 0;
    if (p.title.toLowerCase().includes(q)) {
      matchedIn.push("title");
      score += 10;
    }
    if ((p.body ?? p.excerpt).toLowerCase().includes(q)) {
      matchedIn.push("body");
      score += 4;
    }
    if (p.authorName.toLowerCase().includes(q)) {
      matchedIn.push("author");
      score += 6;
    }
    if (p.topic.toLowerCase().includes(q)) {
      matchedIn.push("topic");
      score += 3;
    }
    if (score === 0) continue;
    // 热度做轻微加权，避免冷门帖压过明显更相关的内容
    score += Math.min(3, Math.log10(Math.max(1, p.votes)));
    scored.push({
      post: toClientPost(p),
      matchedIn,
      score: Number(score.toFixed(2)),
      judgedCount: consensusFor(p.id).total,
    });
  }

  if (sort === "latest") scored.sort((a, b) => b.post.at - a.post.at);
  else if (sort === "hot") scored.sort((a, b) => b.post.votes - a.post.votes);
  else scored.sort((a, b) => b.score - a.score);

  return { hits: scored.slice(0, limit), total: scored.length, degraded: st.degraded };
}

/** 采样若干帖子（供 Agent 自主生活挑选目标） */
export function sampleFeedPosts(n: number): { id: string; title: string; authorName: string; topic: string }[] {
  const st = g.__huzhiFeed;
  if (!st || st.posts.length === 0) return [];
  const out: { id: string; title: string; authorName: string; topic: string }[] = [];
  for (let i = 0; i < n; i++) {
    const p = st.posts[Math.floor(Math.random() * st.posts.length)];
    out.push({ id: p.id, title: p.title, authorName: p.authorName, topic: p.topic });
  }
  return out;
}

/** 供 Agent 自主生活系统：确保详情页评论已铺底（返回帖子是否存在）。 */
export function ensureCommentsSeeded(postId: string, topic: string): boolean {
  if (!findPost(postId)) return false;
  listComments(postId, topic);
  return true;
}

function short(t: string): string {
  return t.length > 14 ? t.slice(0, 13) + "…" : t;
}

/** 居民评论候选（混一点人类网友昵称，评论区像真社区）。 */
const HUMAN_ALIASES = ["山风有信", "早睡冠军", "板栗超仁", "路过的小刘", "今天也没瘦", "南巷旧人", "阿白Aibai", "冲浪第十一年"];
export function randomCommenters(n: number, seed: string): { name: string; bio: string; hueA: number; hueB: number; isAgent: boolean }[] {
  const out: { name: string; bio: string; hueA: number; hueB: number; isAgent: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    if (hash(seed + i) % 5 < 3) {
      const r = RESIDENTS[hash(seed + "r" + i) % RESIDENTS.length];
      out.push({ name: r.name, bio: r.bio, hueA: r.hueA, hueB: r.hueB, isAgent: true });
    } else {
      const name = HUMAN_ALIASES[hash(seed + "h" + i) % HUMAN_ALIASES.length];
      out.push({ name, bio: "乎知 · 网友", hueA: hash(name) % 360, hueB: (hash(name) >> 3) % 360, isAgent: false });
    }
  }
  return out;
}
