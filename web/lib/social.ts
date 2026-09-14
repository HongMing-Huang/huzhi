// 社区互动层：真人发帖（human 池）+ 道具库存 + 商店。全部持久化（重启不丢）。
import { randomUUID } from "node:crypto";
import { loadCollection, saveCollection } from "./db";
import { store } from "@/lib/game/store";
import type { GuessKind } from "@/lib/game/types";

export interface UserPost {
  id: string;
  authorKey: string; // user:<id> 或 guest:<uid>
  authorName: string;
  title: string;
  body: string;
  topic: string;
  at: number;
  votes: number;
  comments: number;
  channelId?: string;
  votedBy: string[]; // 持久化存数组，运行时用 Set 判断
  /**
   * 真人发帖时可选择「伪装 AI」（human_as_agent）：
   * 刻意把自己写得像模型输出，被读者误判为 AI 即算伪装成功。
   * 与 Agent 侧的 agent_as_human 对称，构成四类身份的完整闭环。
   */
  disguiseAsAgent?: boolean;
}

interface UserPostsFile {
  list: UserPost[];
}

export const SHOP_ITEMS = {
  xray: { name: "透视镜", price: 200, desc: "查看任意一篇帖子「AI 还是真人」的判定与理由（不加分不扣分）" },
  double: { name: "双倍卡", price: 150, desc: "下一次猜帖积分翻倍：识破 AI +60，误判 −40" },
  insurance: { name: "止损券", price: 120, desc: "装填后用于下一场 1v1；若误判，回收自己一半注金，猜身份分照常结算" },
} as const;

export type ShopItemKey = keyof typeof SHOP_ITEMS;

const g = globalThis as unknown as {
  __huzhiUserPosts?: Map<string, UserPost & { votedSet?: Set<string> }>;
  __huzhiInventory?: Map<string, Record<string, number>>;
  __huzhiEffects?: Map<string, { doubleNext?: boolean; insuranceNext?: boolean }>;
  __huzhiCheckins?: Map<string, CheckinState>;
  __huzhiSocialLoaded?: boolean;
};

function initPosts(): Map<string, UserPost & { votedSet?: Set<string> }> {
  if (g.__huzhiUserPosts) return g.__huzhiUserPosts;
  const file = loadCollection<UserPostsFile>("user_posts", { list: [] });
  const map = new Map<string, UserPost & { votedSet?: Set<string> }>();
  for (const p of file.list) {
    const votedSet = new Set(p.votedBy ?? []);
    map.set(p.id, { ...p, votedBy: [], votedSet });
  }
  g.__huzhiUserPosts = map;
  return map;
}

function savePosts(): void {
  const map = initPosts();
  const list = [...map.values()].map((p) => ({ ...p, votedBy: [...(p.votedSet ?? [])] }));
  saveCollection("user_posts", { list } satisfies UserPostsFile);
}

function initInv(): Map<string, Record<string, number>> {
  if (g.__huzhiInventory) return g.__huzhiInventory;
  g.__huzhiInventory = new Map(Object.entries(loadCollection<Record<string, Record<string, number>>>("inventory", {})));
  return g.__huzhiInventory;
}

function saveInv(): void {
  const m = initInv();
  saveCollection("inventory", Object.fromEntries(m));
}

function initEffects(): Map<string, { doubleNext?: boolean; insuranceNext?: boolean }> {
  if (g.__huzhiEffects) return g.__huzhiEffects;
  g.__huzhiEffects = new Map(Object.entries(loadCollection<Record<string, { doubleNext?: boolean; insuranceNext?: boolean }>>("effects", {})));
  return g.__huzhiEffects;
}

function saveEffects(): void {
  saveCollection("effects", Object.fromEntries(initEffects()));
}

// ———— 每日签到 ————

interface CheckinState {
  lastDate: string; // YYYY-MM-DD
  streak: number;
}

const CHECKIN_FILE = "checkins";
const CHECKIN_BASE = 50;
const CHECKIN_STREAK_BONUS = 10; // 每多连续一天 +10，封顶 5 天
const CHECKIN_MAX_STREAK = 5;

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function initCheckins(): Map<string, CheckinState> {
  if (g.__huzhiCheckins) return g.__huzhiCheckins;
  g.__huzhiCheckins = new Map(Object.entries(loadCollection<Record<string, CheckinState>>(CHECKIN_FILE, {})));
  return g.__huzhiCheckins;
}

function saveCheckins(): void {
  saveCollection(CHECKIN_FILE, Object.fromEntries(initCheckins()));
}

/** 读取签到状态（今日是否已签、连续天数）。 */
export function getCheckinState(key: string): { doneToday: boolean; streak: number; rewardToday: number } {
  const m = initCheckins();
  const s = m.get(key);
  const today = dayKey();
  const doneToday = s?.lastDate === today;
  const streak = s?.streak ?? 0;
  const rewardToday = CHECKIN_BASE + Math.min(streak, CHECKIN_MAX_STREAK - 1) * CHECKIN_STREAK_BONUS;
  return { doneToday, streak, rewardToday };
}

/** 执行签到：已签返回 error；否则发积分并更新连续天数。 */
export function doCheckin(key: string): { ok: boolean; error?: string; reward?: number; streak?: number; bank?: number } {
  const m = initCheckins();
  const today = dayKey();
  const s = m.get(key);

  if (s?.lastDate === today) {
    return { ok: false, error: "今天已经签到过了，明天再来吧" };
  }

  // 判断连续：昨天签过则 +1，否则重置为 1
  const yesterday = dayKey(new Date(Date.now() - 86400000));
  const streak = s?.lastDate === yesterday ? (s.streak ?? 0) + 1 : 1;

  const reward = CHECKIN_BASE + Math.min(streak - 1, CHECKIN_MAX_STREAK - 1) * CHECKIN_STREAK_BONUS;

  const bank = store.addBank(key, reward, `连续签到第 ${streak} 天`);

  m.set(key, { lastDate: today, streak });
  saveCheckins();
  return { ok: true, reward, streak, bank };
}

// ———— 真人发帖 ————

export function createUserPost(
  authorKey: string,
  authorName: string,
  input: { title?: string; body?: string; topic?: string; channelId?: string; disguiseAsAgent?: boolean },
): { ok: boolean; error?: string; post?: UserPost } {
  const title = (input.title ?? "").trim();
  const body = (input.body ?? "").trim();
  const topic = (input.topic ?? "").trim().slice(0, 60) || "想法";
  if (title.length < 4 || title.length > 80) return { ok: false, error: "标题需要 4–80 字" };
  if (body.length < 10 || body.length > 2000) return { ok: false, error: "正文需要 10–2000 字" };
  if (/我是(AI|ai|人工智能|真人|人类)/.test(title + body)) {
    return { ok: false, error: "反套路规则：内容不得自曝身份" };
  }
  const post: UserPost & { votedSet?: Set<string> } = {
    id: "up_" + randomUUID().slice(0, 10),
    authorKey,
    authorName,
    title,
    body,
    topic,
    at: Date.now(),
    votes: 1,
    comments: 0,
    channelId: input.channelId,
    disguiseAsAgent: Boolean(input.disguiseAsAgent),
    votedBy: [],
    votedSet: new Set(),
  };
  initPosts().set(post.id, post);
  savePosts();
  return { ok: true, post: { ...post, votedBy: post.votedBy ?? [] } };
}

function toClient(p: UserPost & { votedSet?: Set<string> }): UserPost {
  return { ...p, votedBy: [...(p.votedSet ?? [])] };
}

export function getUserPost(id: string): UserPost | undefined {
  const p = initPosts().get(id);
  return p ? toClient(p) : undefined;
}

export function deleteUserPost(id: string, authorKey: string): boolean {
  const map = initPosts();
  const post = map.get(id);
  if (!post || post.authorKey !== authorKey) return false;
  map.delete(id);
  savePosts();
  return true;
}

/** 最新真人帖在前（供 feed 首屏前插）。 */
export function listUserPosts(limit = 20): UserPost[] {
  return [...initPosts().values()].sort((a, b) => b.at - a.at).slice(0, limit).map(toClient);
}

export function userPostToClient(p: UserPost) {
  return {
    id: p.id,
    authorName: p.authorName,
    authorBio: "乎知 · 居民",
    hueA: hashStr(p.authorName) % 360,
    hueB: (hashStr(p.authorName) >> 3) % 360,
    title: p.title,
    excerpt: p.body.slice(0, 400),
    body: p.body,
    votes: p.votes,
    comments: p.comments,
    topic: p.topic,
    at: p.at,
    channelId: p.channelId,
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** 是否本人帖子（禁止猜自己的帖子）。 */
export function isOwnPost(postId: string, authorKey: string): boolean {
  return initPosts().get(postId)?.authorKey === authorKey;
}

/** 评论计数联动（用户帖被评论时 +1）。 */
export function bumpCommentCount(postId: string): void {
  const post = initPosts().get(postId);
  if (post) {
    post.comments += 1;
    savePosts();
  }
}

/** 点赞真人帖（每人一票）。 */
export function voteUserPost(postId: string, uid: string): number | null {
  const post = initPosts().get(postId);
  if (!post) return null;
  post.votedSet ??= new Set();
  if (post.votedSet.has(uid)) return post.votes;
  post.votedSet.add(uid);
  post.votes += 1;
  savePosts();
  return post.votes;
}

// ———— 道具库存与商店 ————

function invOf(key: string): Record<string, number> {
  const m = initInv();
  let inv = m.get(key);
  if (!inv) {
    inv = {};
    m.set(key, inv);
  }
  return inv;
}

export function getInventory(key: string): Record<string, number> {
  return { xray: 0, double: 0, insurance: 0, ...invOf(key) };
}

export function buyItem(key: string, item: ShopItemKey, bank: number): { ok: boolean; error?: string; bank?: number } {
  const price = SHOP_ITEMS[item]?.price;
  if (!price) return { ok: false, error: "没有这个道具" };
  if (bank < price) return { ok: false, error: `积分不足（需要 ${price}，你有 ${bank}）` };
  const inv = invOf(key);
  inv[item] = (inv[item] ?? 0) + 1;
  saveInv();
  return { ok: true, bank: bank - price };
}

export function consumeItem(key: string, item: ShopItemKey): boolean {
  const inv = invOf(key);
  if ((inv[item] ?? 0) <= 0) return false;
  inv[item] -= 1;
  saveInv();
  return true;
}

/** 双倍效果：下一次猜帖生效。 */
export function armDouble(key: string): boolean {
  if (!consumeItem(key, "double")) return false;
  const e = initEffects().get(key) ?? {};
  e.doubleNext = true;
  initEffects().set(key, e);
  saveEffects();
  return true;
}

export function takeDoubleIfArmed(key: string): boolean {
  const e = initEffects().get(key);
  if (!e?.doubleNext) return false;
  e.doubleNext = false;
  saveEffects();
  return true;
}

/** 止损券：先从库存装填，在下一次有效 1v1 锁注时消耗效果。 */
export function armInsurance(key: string): boolean {
  if (!consumeItem(key, "insurance")) return false;
  const e = initEffects().get(key) ?? {};
  e.insuranceNext = true;
  initEffects().set(key, e);
  saveEffects();
  return true;
}

export function takeInsuranceIfArmed(key: string): boolean {
  const e = initEffects().get(key);
  if (!e?.insuranceNext) return false;
  e.insuranceNext = false;
  saveEffects();
  return true;
}

/**
 * 透视镜：消耗一张，返回身份判定（不加分）。peek 由 feed 提供。
 *
 * 修正：旧实现先扣卡再 peek，帖子不存在时道具白白损失。
 * 现改为先取结果，确认可用后再扣卡。
 */
export function useXray(
  key: string,
  peek: () => { identity: "ai" | "human"; truth?: string; reasons: string[] } | null,
): { ok: boolean; error?: string; identity?: "ai" | "human"; truth?: string; reasons?: string[] } {
  const r = peek();
  if (!r) return { ok: false, error: "帖子不存在或已过期" };
  if (!consumeItem(key, "xray")) return { ok: false, error: "没有透视镜了，去商店买一张（200 积分）" };
  return { ok: true, identity: r.identity, truth: r.truth, reasons: r.reasons };
}

/** GuessKind 引用保持类型依赖（未使用时由 tree-shake 移除）。 */
export type { GuessKind };
