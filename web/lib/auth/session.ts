// 会话：随机 token + HttpOnly cookie。token 持久化（重启后登录态仍在）。
// 注意：本模块不做任何网络请求，只操作本地存储；cookie 值由各 Route Handler 负责读取。
import { randomBytes } from "node:crypto";
import { loadCollection, saveCollection } from "../db";
import { getUserById, type User } from "./users";

export const SESSION_COOKIE = "huzhi_session";
const SESSION_TTL = 30 * 24 * 3600 * 1000;

interface SessionsFile {
  list: { token: string; userId: string; exp: number }[];
}

const g = globalThis as unknown as { __huzhiSessions?: Map<string, { userId: string; exp: number }> };

function init(): Map<string, { userId: string; exp: number }> {
  if (g.__huzhiSessions) return g.__huzhiSessions;
  const file = loadCollection<SessionsFile>("sessions", { list: [] });
  const map = new Map(file.list.filter((s) => s.exp > Date.now()).map((s) => [s.token, { userId: s.userId, exp: s.exp }]));
  g.__huzhiSessions = map;
  return map;
}

function save(): void {
  const map = init();
  saveCollection("sessions", { list: [...map.entries()].map(([token, s]) => ({ token, ...s })) } satisfies SessionsFile);
}

export function createSession(userId: string): { token: string; maxAge: number } {
  const token = randomBytes(24).toString("hex");
  init().set(token, { userId, exp: Date.now() + SESSION_TTL });
  save();
  return { token, maxAge: Math.floor(SESSION_TTL / 1000) };
}

export function destroySession(token: string): void {
  if (init().delete(token)) save();
}

/** 按 token 解析当前登录用户（无效/过期一律返回 null）。 */
export function resolveSessionUser(token: string | undefined): User | null {
  if (!token) return null;
  const s = init().get(token);
  if (!s) return null;
  if (s.exp < Date.now()) {
    init().delete(token);
    save();
    return null;
  }
  return getUserById(s.userId) ?? null;
}

/** 会话 Cookie 属性：secure 按请求协议动态决定——恒为 true 会让 HTTP 的
 *  IP 直访部署下浏览器拒绝回传 Cookie，登录根本存不住（线上实测踩坑）。 */
export function sessionCookieOptions(secure: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/" };
}
