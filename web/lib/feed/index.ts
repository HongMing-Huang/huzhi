// 乎知 feed：真实知乎内容（真人池）× Agent 生成内容（AI 池）混排。
// v3：大内容池 + 游标分页，支持无限刷；身份只在服务端保存。
import { getHotTopics } from "@/lib/zhihu/hot";
import { searchZhihu, hasSearchCredential } from "@/lib/zhihu/search";
import { generateAgentPosts, randomSalt } from "./generate";
import { residentById, RESIDENTS } from "./residents";
import { listAgentPosts, listAgentComments, getAgentById } from "@/lib/agents/registry";
import { listUserPosts, userPostToClient, getUserPost, bumpCommentCount } from "@/lib/social";
import { loadCollection, saveCollection } from "../db";
import { ensureAgentLife } from "@/lib/agents/autonomous";
import type { GuessKind } from "@/lib/game/types";

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
  /** 发布时间（用于关注流语义行） */
  at: number;
  /** 服务端密封，绝不进客户端响应 */
  identity: "ai" | "human";
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
  } else {
    degraded = true;
    reason = "未配置知乎凭证，真人池使用本地语料替代";
  }
  if (humanCount < 4) degraded = true;

  // —— AI 池：内置居民 Agent 补满内容池 ——
  // 每个话题生成多批，variant 递增保证标题句式轮换不撞车
  const need = Math.max(0, POOL_TARGET - posts.length);
  const perTopic = new Map<string, number>();
  for (let i = 0; i < need; i++) {
    const topic = topics[i % topics.length]?.title ?? "今天也是想摆摆的一天";
    const variant = perTopic.get(topic) ?? 0;
    perTopic.set(topic, variant + 1);
    const [gen] = generateAgentPosts(topic, 1, `${salt}|${i}`, variant);
    const r = residentById(gen.residentId);
    const seed = `${salt}|${i}|${topic}`;
    posts.push({
      id: `a${i.toString(36)}${hash(seed).toString(36)}`,
      authorName: r.name,
      authorBio: r.bio,
      hueA: r.hueA,
      hueB: r.hueB,
      title: gen.title,
      excerpt: gen.body.slice(0, 400),
      body: gen.body,
      votes: pseudoVotes(seed + "v", 23, 4200),
      comments: pseudoVotes(seed + "c", 3, 260),
      topic,
      identity: "ai",
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
  for (const rec of recs) {
    if (state.posts.some((p) => p.id === rec.postId)) continue;
    const a = getAgentById(rec.agentId);
    if (!a || a.status !== "active") continue;
    const seed = `${rec.postId}|agent`;
    state.posts.push({
      id: rec.postId,
      authorName: a.name,
      authorBio: a.bio, // 藏好：不标注 Agent 身份，与内置居民无差别
      hueA: hash(a.name) % 360,
      hueB: (hash(a.name) >> 3) % 360,
      title: rec.title,
      excerpt: rec.body.slice(0, 400),
      body: rec.body,
      votes: pseudoVotes(seed + "v", 3, 900),
      comments: pseudoVotes(seed + "c", 0, 88),
      topic: rec.topic ?? "Agent 投稿",
      identity: "ai",
      at: Date.now() - Math.floor(Math.random() * 172800000),
    });
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
      st.posts.push({
        id: `e${st.ext.toString(36)}${k}${hash(seed).toString(36)}`,
        authorName: r.name,
        authorBio: r.bio,
        hueA: r.hueA,
        hueB: r.hueB,
        title: gen.title,
        excerpt: gen.body.slice(0, 400),
        body: gen.body,
        votes: pseudoVotes(seed + "v", 23, 4200),
        comments: pseudoVotes(seed + "c", 3, 260),
        topic,
        identity: "ai",
        at: Date.now() - Math.floor(Math.random() * 172800000),
      });
    }
    if (st.posts.length >= POOL_HARD_CAP) break; // 内存保护
  }
}

export interface FeedPage {
  posts: Omit<FeedPost, "identity">[];
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
    const userPosts = listUserPosts(3).map(userPostToClient);
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

export function toClientPost(p: FeedPost): Omit<FeedPost, "identity"> {
  const { identity: _identity, ...rest } = p;
  return rest;
}

function findPost(postId: string): FeedPost | undefined {
  return g.__huzhiFeed?.posts.find((p) => p.id === postId);
}

/**
 * 揭晓理由：基于文本特征解释「为什么判定它是 AI / 真人」。
 * 与侦探辅助同一套启发式（依据 gameplay-research 的文献线索），只解释已揭晓的事实。
 */
export function explainIdentity(p: FeedPost): string[] {
  const text = p.body ?? p.excerpt;
  const struct = (text.match(/首先|其次|再者|综上|总而言之|值得注意的是|总体来看|希望对你有帮助/g) ?? []).length;
  const casual = (text.match(/哈哈|hhh|？？|\?\?|草|狗头|emmm|啊啊啊|😅|🤡|。。|，，/g) ?? []).length;
  const lens = text.split(/[。！?\n]/).filter((s) => s.trim().length > 1);
  const avgLen = lens.length ? text.length / lens.length : 0;
  const reasons: string[] = [];

  if (p.identity === "ai") {
    if (struct >= 1) reasons.push(`出现了 ${struct} 处「首先/综上」类结构词，行文像在写提纲而不是聊天`);
    else reasons.push("全文没有一个语气词或错字，干净得不像随手打字");
    if (casual === 0) reasons.push("没有口语碎片（哈哈、？？、狗头之类），情感表达偏平");
    if (avgLen > 40) reasons.push(`平均句长 ${avgLen.toFixed(0)} 字，句子又长又完整，是低 burstiness 的典型特征`);
    reasons.push("回复内容由生成模型产出（揭晓：AI 池）");
  } else {
    if (p.url) reasons.push("内容来自知乎站内真实账号的公开发布，有据可查");
    if (casual > 0) reasons.push(`带 ${casual} 处口语碎片（语气词/错字/梗），是随手打字的痕迹`);
    if (struct === 0) reasons.push("完全没有提纲式结构词，想到哪写到哪");
    if (avgLen > 0 && avgLen <= 30) reasons.push(`平均句长 ${avgLen.toFixed(0)} 字，短句为主，节奏更像真人`);
    reasons.push("来源可追溯到真实用户（揭晓：真人池）");
  }
  return reasons.slice(0, 3);
}

export function guessFeedPost(
  postId: string,
  guess: GuessKind,
): { ok: boolean; error?: string; correct?: boolean; identity?: "ai" | "human"; points?: number; reasons?: string[] } {
  const post = findPost(postId);
  if (!post) return { ok: false, error: "帖子不存在或已过期" };
  if (guess !== "ai" && guess !== "human") return { ok: false, error: "只能猜 AI 或真人" };
  const correct = guess === post.identity;
  const points = correct ? (post.identity === "ai" ? 30 : 10) : -20;
  return { ok: true, correct, identity: post.identity, points, reasons: explainIdentity(post) };
}

/** 详情页读取（脱敏）：混池帖与用户真人帖都在此出口。 */
export function getPostDetail(postId: string): Omit<FeedPost, "identity"> | null {
  const pool = findPost(postId);
  if (pool) return toClientPost(pool);
  const up = getUserPost(postId);
  return up ? userPostToClient(up) : null;
}

/** 透视镜用：不解密封装，直接返回身份与理由（调用方负责扣道具）。 */
export function peekIdentity(postId: string): { identity: "ai" | "human"; reasons: string[] } | null {
  const post = findPost(postId);
  if (!post) return null;
  return { identity: post.identity, reasons: explainIdentity(post) };
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
    // 铺 2–4 条种子评论，让每个详情页一打开就“有人气”
    const n = 2 + (hash(postId) % 3);
    const commenters = randomCommenters(n, postId);
    const base = Date.now() - n * 3600_000;
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
