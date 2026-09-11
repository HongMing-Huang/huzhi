// 用户账号（持久化到 lib/db，重启不丢）。
import { randomBytes } from "node:crypto";
import { loadCollection, saveCollection } from "../db";
import { hashPassword } from "./passwords";

export interface User {
  id: string;
  name: string;
  passHash: string;
  createdAt: number;
}

interface UserStore {
  byId: Map<string, User>;
  byName: Map<string, string>; // 小写名 -> id
}

interface UsersFile {
  list: User[];
}

const g = globalThis as unknown as { __huzhiUsers?: UserStore };

function init(): UserStore {
  if (g.__huzhiUsers) return g.__huzhiUsers;
  const file = loadCollection<UsersFile>("users", { list: [] });
  const byId = new Map<string, User>();
  const byName = new Map<string, string>();
  for (const u of file.list) {
    byId.set(u.id, u);
    byName.set(u.name.toLowerCase(), u.id);
  }
  const s: UserStore = { byId, byName };
  g.__huzhiUsers = s;
  return s;
}

function save(): void {
  const s = init();
  saveCollection("users", { list: [...s.byId.values()] } satisfies UsersFile);
}

export function bankKeyForUser(userId: string): string {
  return `user:${userId}`;
}

export function createUser(name: string, password: string): { user?: User; error?: string } {
  const n = name.trim();
  if (n.length < 2 || n.length > 20) return { error: "名号需要 2–20 个字符" };
  if (password.length < 6 || password.length > 64) return { error: "密码需要 6–64 位" };
  const s = init();
  const lower = n.toLowerCase();
  if (s.byName.has(lower)) return { error: "这个名号已经被注册了" };
  const user: User = {
    id: "u_" + randomBytes(6).toString("hex"),
    name: n,
    passHash: hashPassword(password),
    createdAt: Date.now(),
  };
  s.byId.set(user.id, user);
  s.byName.set(lower, user.id);
  save();
  return { user };
}

export function findUserByName(name: string): User | undefined {
  const s = init();
  const id = s.byName.get(name.trim().toLowerCase());
  return id ? s.byId.get(id) : undefined;
}

export function getUserById(id: string): User | undefined {
  return init().byId.get(id);
}

export function listUsers(): User[] {
  return [...init().byId.values()];
}
