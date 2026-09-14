// Upstash 模式持久层的双进程实测（不依赖真实 Upstash 账号）。
//
// 原理：mock 一个实现 Upstash REST 形状（POST / 与 /pipeline，GET/SET/SADD/SMEMBERS）
// 的本地服务；stub 全局 fetch 把 https://demo.upstash.io 转发到 mock——db.ts 的
// 域名白名单照常生效，网络层被替换为本地共享存储，从而模拟「两个独立实例」。
//
// 用法（三步，顺序执行）：
//   node --experimental-strip-types scripts/test-db-upstash.mts --server   # 起共享存储
//   node --experimental-strip-types scripts/test-db-upstash.mts --write    # 实例 A 写入后退出
//   node --experimental-strip-types scripts/test-db-upstash.mts --read     # 实例 B 冷启动读取
import http from "node:http";

const PORT = 3807;
const STORE = process.env.HUZHI_MOCK_STORE ?? ""; // 仅 server 进程使用

// ---------------------------------------------------------------------------
// server 进程：共享存储（跨子进程通过环境变量传递快照？不——用独立进程持有）
// ---------------------------------------------------------------------------
async function runServer(): Promise<void> {
  const kv = new Map<string, string>();
  const sets = new Map<string, string[]>();
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const reply = (payload: unknown) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(payload));
      };
      if (req.url === "/__dump") {
        reply({ kv: [...kv.keys()], sets: [...sets.keys()] });
        return;
      }
      const run = (cmd: (string | number)[]): { result?: unknown; error?: string } => {
        const [op, key, ...rest] = cmd;
        try {
          if (op === "SET") {
            kv.set(String(key), String(rest[0]));
            return { result: "OK" };
          }
          if (op === "GET") {
            const v = kv.get(String(key));
            return { result: v === undefined ? null : v };
          }
          if (op === "SADD") {
            const cur = sets.get(String(key)) ?? [];
            if (!cur.includes(String(rest[0]))) cur.push(String(rest[0]));
            sets.set(String(key), cur);
            return { result: 1 };
          }
          if (op === "SMEMBERS") {
            return { result: sets.get(String(key)) ?? [] };
          }
          return { error: `unknown command ${String(op)}` };
        } catch (e) {
          return { error: String(e) };
        }
      };
      if (req.url === "/pipeline") {
        const cmds = JSON.parse(body) as (string | number)[][];
        reply({ result: cmds.map(run) }); // 真实 Upstash 的 pipeline 响应是 {result: [...]}
        return;
      }
      reply(run(JSON.parse(body) as (string | number)[]));
    });
  });
  server.listen(PORT, () => console.log(`mock upstash on :${PORT}`));
}

// ---------------------------------------------------------------------------
// 客户端进程：stub fetch 后加载真实 db.ts
// ---------------------------------------------------------------------------
async function withDb(fn: (db: typeof import("../lib/db.ts")) => Promise<void>): Promise<void> {
  const realFetch = globalThis.fetch;
  (globalThis as { fetch: typeof fetch }).fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    return realFetch(url.replace("https://demo.upstash.io", `http://127.0.0.1:${PORT}`), init);
  }) as typeof fetch;
  process.env.UPSTASH_REDIS_REST_URL = "https://demo.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-only";
  const db = await import("../lib/db.ts");
  await fn(db);
}

async function runWrite(): Promise<void> {
  await withDb(async (db) => {
    if (db.persistenceMode() !== "upstash") throw new Error("mode != upstash");
    await db.preloadCollections(); // 模拟 instrumentation 启动预热
    db.saveCollection("users", { list: [{ id: "u_1", name: "alice" }] });
    db.saveCollection("banks", { "feed:u_1": 100 });
    await new Promise((r) => setTimeout(r, 600)); // 等回写完成
    console.log("WRITE_OK");
  });
}

async function runRead(): Promise<void> {
  await withDb(async (db) => {
    await db.preloadCollections();
    const users = db.loadCollection<{ list: { name: string }[] }>("users", { list: [] });
    const banks = db.loadCollection<Record<string, number>>("banks", {});
    const ok = users.list[0]?.name === "alice" && banks["feed:u_1"] === 100;
    console.log(ok ? "READ_OK 跨实例持久化成立" : `READ_FAIL users=${JSON.stringify(users)} banks=${JSON.stringify(banks)}`);
    if (!ok) process.exit(1);
  });
}

const mode = process.argv[2];
if (mode === "--server") void runServer();
else if (mode === "--write") void runWrite();
else if (mode === "--read") void runRead();
else {
  console.error("usage: --server | --write | --read");
  process.exit(2);
}
