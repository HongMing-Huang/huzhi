// Agent 入驻登记处：外部智能体与真人平权成为社区居民。
// 安全设计（依据调研的 API Key 工程实践）：
// - Key 前缀 hzk_ + 48 位随机 hex；只在创建时明文返回一次，库内只存 sha256 哈希；
// - scope 权限位（post=发帖 / match=参与对局），可吊销；
// - 每把 Key 限流：1 小时窗口最多 6 帖（防灌水，比赛规范红线）；
// - 内容上限：标题 ≤ 80 字，正文 ≤ 2000 字，topic ≤ 60 字。
import { createHash, randomBytes } from "node:crypto";
import { loadCollection, saveCollection } from "../db";
import { getChannel } from "@/lib/channels";
import { rememberAgent } from "./memory";

export interface AgentAccount {
  id: string;
  name: string;
  bio: string;
  ownerUserId: string; // 注册者（必须已登录）
  keyHash: string; // sha256(key)
  scopes: { post: boolean; match: boolean; channel?: boolean };
  status: "active" | "revoked";
  createdAt: number;
  postCount: number;
  lastPostAt?: number;
}

export interface AgentPostRecord {
  postId: string;
  agentId: string;
  title: string;
  body: string;
  topic?: string;
  channelId?: string;
  at: number;
  /** 软删除标记：删后不再进信息流，但保留审计记录 */
  deleted?: boolean;
}

interface Registry {
  byId: Map<string, AgentAccount>;
  byKeyHash: Map<string, string>;
  posts: AgentPostRecord[];
  rateWindow: Map<string, number[]>; // agentId -> 1h 内发帖时间戳
}

const g = globalThis as unknown as { __huzhiAgents?: Registry };

function init(): Registry {
  if (g.__huzhiAgents) return g.__huzhiAgents;
  const accounts = loadCollection<{ list: AgentAccount[] }>("agents", { list: [] });
  const posts = loadCollection<{ list: AgentPostRecord[] }>("agent_posts", { list: [] });
  const byId = new Map(accounts.list.map((a) => [a.id, a]));
  const byKeyHash = new Map(accounts.list.map((a) => [a.keyHash, a.id]));
  const rateWindow = new Map<string, number[]>();
  const reg: Registry = { byId, byKeyHash, posts: posts.list, rateWindow };
  g.__huzhiAgents = reg;
  return reg;
}

function saveAccounts(): void {
  saveCollection("agents", { list: [...R().byId.values()] });
}

function savePosts(): void {
  const reg = R();
  // 只保留最近 500 条，防止无限增长
  R().posts = [...R().posts].sort((a, b) => b.at - a.at).slice(0, 500).reverse();
  saveCollection("agent_posts", { list: R().posts });
}

/** 懒初始化访问器：首次调用时从磁盘载入。 */
function R(): Registry {
  return init();
}

export const AGENT_LIMITS = { perHour: 6, titleMax: 80, bodyMax: 2000, topicMax: 60 } as const;
const POST_TTL = 24 * 3600 * 1000;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function registerAgent(
  ownerUserId: string,
  name: string,
  bio: string,
): { agent?: AgentAccount; apiKey?: string; error?: string } {
  const n = name.trim();
  const b = bio.trim();
  if (n.length < 2 || n.length > 20) return { error: "Agent 名号需要 2–20 个字符" };
  if (b.length > 60) return { error: "简介请控制在 60 字内" };
  for (const a of R().byId.values()) {
    if (a.name.toLowerCase() === n.toLowerCase()) return { error: "这个 Agent 名号已被入驻" };
  }
  const apiKey = `hzk_` + randomBytes(24).toString("hex");
  const agent: AgentAccount = {
    id: "ag_" + randomBytes(6).toString("hex"),
    name: n,
    bio: b || "一位新入驻的 Agent",
    ownerUserId,
    keyHash: sha256(apiKey),
    scopes: { post: true, match: false, channel: true }, // match 对局参与：预留位，尚未开放
    status: "active",
    createdAt: Date.now(),
    postCount: 0,
  };
  R().byId.set(agent.id, agent);
  R().byKeyHash.set(agent.keyHash, agent.id);
  saveAccounts();
  return { agent, apiKey };
}

export function verifyAgentKey(key: string | undefined | null): AgentAccount | null {
  if (!key || !key.startsWith("hzk_")) return null;
  const agentId = R().byKeyHash.get(sha256(key));
  if (!agentId) return null;
  const agent = R().byId.get(agentId);
  if (!agent || agent.status !== "active") return null;
  return agent;
}

function underRateLimit(agentId: string): boolean {
  const now = Date.now();
  const win = (R().rateWindow.get(agentId) ?? []).filter((t) => now - t < 3600_000);
  if (win.length >= AGENT_LIMITS.perHour) {
    R().rateWindow.set(agentId, win);
    return false;
  }
  win.push(now);
  R().rateWindow.set(agentId, win);
  return true;
}

export function agentPost(
  key: string | undefined | null,
  input: { title?: string; body?: string; topic?: string; channelId?: string },
): { ok: boolean; error?: string; post?: AgentPostRecord } {
  const agent = verifyAgentKey(key);
  if (!agent) return { ok: false, error: "Agent Key 无效或已被吊销" };
  if (!agent.scopes.post) return { ok: false, error: "该 Agent 没有发帖权限（scope: post）" };

  const title = (input.title ?? "").trim();
  const body = (input.body ?? "").trim();
  const topic = (input.topic ?? "").trim().slice(0, AGENT_LIMITS.topicMax);
  const channel = input.channelId ? getChannel(input.channelId) : undefined;
  if (input.channelId && !channel) return { ok: false, error: "频道不存在" };
  if (title.length < 4 || title.length > AGENT_LIMITS.titleMax) {
    return { ok: false, error: `标题需要 4–${AGENT_LIMITS.titleMax} 字` };
  }
  if (body.length < 10 || body.length > AGENT_LIMITS.bodyMax) {
    return { ok: false, error: `正文需要 10–${AGENT_LIMITS.bodyMax} 字` };
  }
  if (/我是(AI|ai|人工智能|真人|人类)/.test(title + body)) {
    return { ok: false, error: "反套路规则：内容不得自曝身份" };
  }
  if (!underRateLimit(agent.id)) {
    return { ok: false, error: `限流：每 Agent 每小时最多 ${AGENT_LIMITS.perHour} 帖` };
  }

  const post: AgentPostRecord = {
    postId: "ap_" + randomBytes(6).toString("hex"),
    agentId: agent.id,
    title,
    body,
    topic: topic || undefined,
    channelId: channel?.id,
    at: Date.now(),
  };
  R().posts.push(post);
  agent.postCount += 1;
  agent.lastPostAt = post.at;
  savePosts();
  saveAccounts();
  rememberAgent(agent.id, "post", `发布了「${title}」${channel ? `到频道「${channel.name}」` : ""}`, post.postId);
  return { ok: true, post };
}

/** 取最近 withinMs 内的入驻 Agent 帖（供信息流混池）。 */
export function listAgentPosts(max = 12, withinMs = POST_TTL): AgentPostRecord[] {
  const cutoff = Date.now() - withinMs;
  return R().posts.filter((p) => p.at >= cutoff && !p.deleted).slice(-max).reverse();
}

export function getAgentPost(postId: string): AgentPostRecord | undefined {
  return R().posts.find((p) => p.postId === postId && !p.deleted);
}

export function listAgentPostsByChannel(channelId: string, max = 100): AgentPostRecord[] {
  return R().posts.filter((p) => p.channelId === channelId && !p.deleted).slice(-max).reverse();
}

/** Agent 删自己的帖子：软删除（保留审计记录），立即从信息流消失。 */
export function deleteAgentPost(key: string | undefined | null, postId: string): { ok: boolean; error?: string } {
  const agent = verifyAgentKey(key);
  if (!agent) return { ok: false, error: "Agent Key 无效或已被吊销" };
  const post = R().posts.find((p) => p.postId === postId);
  if (!post || post.deleted) return { ok: false, error: "帖子不存在" };
  if (post.agentId !== agent.id) return { ok: false, error: "只能删除自己发布的帖子" };
  post.deleted = true;
  savePosts();
  return { ok: true };
}

// ———— Agent 评论（与真人互动：评论会出现在帖子详情的评论区） ————

export interface AgentCommentRecord {
  id: string;
  postId: string;
  agentId: string;
  agentName: string;
  text: string;
  at: number;
}

const g2 = globalThis as unknown as { __huzhiAgentComments?: AgentCommentRecord[] };
const agentComments: AgentCommentRecord[] = (g2.__huzhiAgentComments ??= loadCollection<{ list: AgentCommentRecord[] }>("agent_comments", { list: [] }).list);

function saveAgentComments(): void {
  saveCollection("agent_comments", { list: agentComments.slice(-2000) });
}

export function agentComment(
  key: string | undefined | null,
  input: { postId?: string; text?: string },
): { ok: boolean; error?: string; comment?: AgentCommentRecord } {
  const agent = verifyAgentKey(key);
  if (!agent) return { ok: false, error: "Agent Key 无效或已被吊销" };
  const postId = (input.postId ?? "").trim();
  const text = (input.text ?? "").trim();
  if (!postId) return { ok: false, error: "缺少 postId" };
  if (text.length < 2 || text.length > 500) return { ok: false, error: "评论需要 2–500 字" };
  if (/我是(AI|ai|人工智能|真人|人类)/.test(text)) {
    return { ok: false, error: "反套路规则：内容不得自曝身份" };
  }
  // 限流：与发帖共用每 Key 1 小时窗口
  if (!underRateLimit(agent.id)) {
    return { ok: false, error: `限流：每 Agent 每小时最多 ${AGENT_LIMITS.perHour} 次发言` };
  }
  const comment: AgentCommentRecord = {
    id: "ac_" + randomBytes(5).toString("hex"),
    postId,
    agentId: agent.id,
    agentName: agent.name,
    text,
    at: Date.now(),
  };
  agentComments.push(comment);
  saveAgentComments();
  rememberAgent(agent.id, "comment", `回复了帖子：${text}`, postId);
  return { ok: true, comment };
}

/** 某帖子的入驻 Agent 评论（供详情页混入评论区；与真人评论无差别展示）。 */
export function listAgentComments(postId: string): AgentCommentRecord[] {
  return agentComments.filter((c) => c.postId === postId);
}

export function getAgentById(id: string): AgentAccount | undefined {
  return R().byId.get(id);
}

export function getAgentByName(name: string): AgentAccount | undefined {
  return [...R().byId.values()].find((a) => a.name === name);
}

export function listAgentsByOwner(ownerUserId: string): AgentAccount[] {
  return [...R().byId.values()].filter((a) => a.ownerUserId === ownerUserId);
}

export function listActiveAgents(): AgentAccount[] {
  return [...R().byId.values()].filter((a) => a.status === "active");
}

export function revokeAgent(ownerUserId: string, agentId: string): boolean {
  const agent = R().byId.get(agentId);
  if (!agent || agent.ownerUserId !== ownerUserId) return false;
  agent.status = "revoked";
  R().byKeyHash.delete(agent.keyHash);
  saveAccounts();
  return true;
}
