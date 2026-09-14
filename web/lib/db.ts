// 乎知持久层：双模式（单文件收口，业务模块零改动）。
//
// ① 文件模式（默认）：每个集合一个 JSON 文件（DATA_DIR/<name>.json），
//    同步原子落盘——本地开发与带持久卷的容器部署用这个。
// ② Upstash 模式（配置 UPSTASH_REDIS_REST_URL/TOKEN 时）：Vercel 等
//    只读文件系统平台的存活方案。整集合 JSON 存一个 Redis key，
//    冷启动时预热进内存（instrumentation.ts 在响应任何请求前 await），
//    写入先落内存（业务同步语义不变），响应后异步回写 Upstash。
//
// 远端模式的安全边界：出站仅 https + Upstash 托管域（*.upstash.io，
// 固定服务方），每次请求前就地校验、不跟随重定向、URL 不携带身份信息。
// 一致性边界（演示规模下可接受，如实告知）：跨实例「整集合后写者胜」；
// 预热未完成前拒绝回写，绝不用空数据覆盖远端；回写失败自动退避重试。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), ".data");

// ---------------------------------------------------------------------------
// 模式判定与远端端点白名单
// ---------------------------------------------------------------------------
function parseRedisEndpoint(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host !== "upstash.io" && !host.endsWith(".upstash.io")) return null;
    return `https://${host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

const REDIS_URL = parseRedisEndpoint(process.env.UPSTASH_REDIS_REST_URL?.trim());
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
const REMOTE = Boolean(REDIS_URL && REDIS_TOKEN);

const INDEX_KEY = "huzhi:collections";
const KEY_PREFIX = "huzhi:col:";

export function persistenceMode(): "file" | "upstash" {
  return REMOTE ? "upstash" : "file";
}

interface DbGlobal {
  loaded: Set<string>;
  cache: Map<string, unknown>;
}

const g = globalThis as unknown as { __huzhiDb?: DbGlobal };
const db: DbGlobal = (g.__huzhiDb ??= {
  loaded: new Set(),
  cache: new Map(),
});

// ---------------------------------------------------------------------------
// Upstash REST 客户端（只用到 GET/SET/SADD/SMEMBERS，命令体走 JSON 数组）
// ---------------------------------------------------------------------------
type RedisArgs = (string | number)[];

/**
 * 出站边界（每次请求前就地执行）：仅允许 https + Upstash 托管域、
 * URL 不携带身份信息——把请求面锁死在固定服务方。
 */
function assertUpstashEndpoint(url: string): void {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("upstash endpoint must be https");
  if (u.username || u.password) throw new Error("upstash endpoint must not embed credentials");
  const host = u.hostname.toLowerCase();
  if (host !== "upstash.io" && !host.endsWith(".upstash.io")) {
    throw new Error(`upstash endpoint host not allowed: ${host}`);
  }
}

async function redisCommand(args: RedisArgs, timeoutMs = 8000): Promise<unknown> {
  const endpoint = REDIS_URL as string;
  assertUpstashEndpoint(endpoint);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
    redirect: "error",
  });
  if (!res.ok) throw new Error(`upstash HTTP ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(`upstash: ${json.error}`);
  return json.result;
}

async function redisPipeline(cmds: RedisArgs[], timeoutMs = 8000): Promise<{ result?: unknown; error?: string }[]> {
  const endpoint = `${REDIS_URL}/pipeline`;
  assertUpstashEndpoint(endpoint);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmds),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
    redirect: "error",
  });
  if (!res.ok) throw new Error(`upstash HTTP ${res.status}`);
  const json = (await res.json()) as { result?: { result?: unknown; error?: string }[]; error?: string };
  if (json.error) throw new Error(`upstash: ${json.error}`);
  return json.result ?? [];
}

// ---------------------------------------------------------------------------
// 远端预热：进程启动时一次性把全部集合拉进内存（由 instrumentation 调用）
// ---------------------------------------------------------------------------
let preloadDone = false;
let preloadFailed = false;

export async function preloadCollections(): Promise<void> {
  if (!REMOTE || preloadDone) return;
  try {
    const names = (await redisCommand(["SMEMBERS", INDEX_KEY])) as unknown;
    if (Array.isArray(names) && names.length > 0) {
      const results = await redisPipeline(names.map((n) => ["GET", KEY_PREFIX + String(n)]));
      names.forEach((raw, i) => {
        const name = String(raw);
        const entry = results[i];
        if (!entry || entry.error) return; // 读取失败的键不标记 loaded，留给下次预热
        const value = typeof entry.result === "string" ? entry.result : null;
        if (value !== null) {
          try {
            db.cache.set(name, JSON.parse(value));
          } catch {
            // 单个集合损坏不阻塞启动：按空集合处理
          }
        }
        db.loaded.add(name); // result 为 null 表示远端确认不存在 → 标记为空集合
      });
    }
    preloadDone = true;
  } catch (e) {
    // 预热失败：远端数据只读保护生效（saveCollection 不回写），业务降级为实例内存
    preloadFailed = true;
    console.error("[huzhi:db] Upstash 预热失败，本实例仅内存运行且回写已冻结:", e);
  }
}

// ---------------------------------------------------------------------------
// 回写：请求结束后把挂起的集合写回 Upstash（after 保活，失败退避重试）
// ---------------------------------------------------------------------------
const pending = new Map<string, unknown>();
let flushing = false;

async function flushPending(): Promise<void> {
  if (!REMOTE || flushing || pending.size === 0) return;
  if (!preloadDone) return; // 预热未完成绝不回写，防空数据覆盖
  flushing = true;
  const snapshot = new Map(pending);
  for (const name of snapshot.keys()) pending.delete(name);
  try {
    const cmds: RedisArgs[] = [...snapshot.keys()].map((n) => ["SADD", INDEX_KEY, n]);
    cmds.push(...[...snapshot.entries()].map(([n, v]) => ["SET", KEY_PREFIX + n, JSON.stringify(v)]));
    const results = await redisPipeline(cmds);
    const failed = results.filter((r) => r.error);
    if (failed.length > 0) throw new Error(`upstash pipeline ${failed.length} 项失败`);
  } catch (e) {
    // 失败的键退避重试；期间新写入保留在 pending 里不被覆盖
    for (const [name, value] of snapshot) {
      if (!pending.has(name)) pending.set(name, value);
    }
    console.error("[huzhi:db] 回写失败，2s 后重试:", e);
    setTimeout(() => void flushPending(), 2000);
  } finally {
    flushing = false;
  }
}

type AfterFn = (fn: () => Promise<void> | void) => void;
let cachedAfter: AfterFn | null | undefined;

async function scheduleFlush(): Promise<void> {
  if (cachedAfter === undefined) {
    try {
      const mod = (await import("next/server")) as { after?: AfterFn };
      cachedAfter = typeof mod.after === "function" ? mod.after : null;
    } catch {
      cachedAfter = null;
    }
  }
  if (cachedAfter) {
    try {
      cachedAfter(() => flushPending()); // 响应返回后仍保活执行
      return;
    } catch {
      // 不在请求作用域（如 instrumentation），走立即触发
    }
  }
  setTimeout(() => void flushPending(), 0);
}

// ---------------------------------------------------------------------------
// 对外接口（签名与文件模式完全一致）
// ---------------------------------------------------------------------------

/** 读取集合（命中内存缓存；远端模式下由启动预热填充缓存）。 */
export function loadCollection<T>(name: string, fallback: T): T {
  if (db.loaded.has(name)) return (db.cache.get(name) as T) ?? fallback;

  if (REMOTE) {
    if (!preloadDone) {
      // 理论上不会发生（instrumentation 先于请求完成预热）；
      // 万一发生：返回兜底但【不缓存不标记】，预热完成后下次读取拿到真值
      void preloadCollections();
      return fallback;
    }
    const cached = db.cache.get(name);
    if (cached !== undefined) {
      db.loaded.add(name);
      return cached as T;
    }
    // 预热已完成但缓存没有 → 远端确认不存在的新集合
    db.loaded.add(name);
    db.cache.set(name, fallback);
    return fallback;
  }

  // 文件模式（原实现）
  db.loaded.add(name);
  try {
    if (existsSync(fileOf(name))) {
      const parsed = JSON.parse(readFileSync(fileOf(name), "utf8")) as T;
      db.cache.set(name, parsed);
      return parsed;
    }
  } catch {
    // 文件损坏时不阻塞启动：按空集合处理，下次写盘覆盖
  }
  db.cache.set(name, fallback);
  return fallback;
}

/** 变更集合：更新缓存；文件模式立即原子落盘，远端模式排队回写。 */
export function saveCollection(name: string, value: unknown): void {
  db.cache.set(name, value);
  if (!REMOTE) {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      const tmp = fileOf(name) + ".tmp";
      writeFileSync(tmp, JSON.stringify(value), "utf8");
      renameSync(tmp, fileOf(name)); // 原子替换，进程被杀也不会写坏
    } catch {
      // 磁盘异常不阻塞游戏逻辑
    }
    return;
  }
  if (preloadFailed) return; // 只读保护：绝不拿本实例数据覆盖远端
  pending.set(name, value);
  void scheduleFlush();
}

function fileOf(name: string): string {
  return join(DATA_DIR, `${name}.json`);
}
