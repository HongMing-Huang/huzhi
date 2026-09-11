// 乎知持久层：JSON 文件数据库（零依赖，重启不丢数据）。
// - 每个集合一个文件：<project>/web/.data/<name>.json
// - 每次变更立即同步落盘（临时文件 + rename 原子替换，进程被杀也不写坏）
// - 写入频率为「每次用户操作一次」，量级小，无需防抖
// - 接口形状与未来的 Postgres 仓储层一致：迁移时只换本文件实现
//   （表结构见 web/db/schema.sql，方案见 docs/research/backend-architecture-research.md）
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), ".data");

interface DbGlobal {
  loaded: Set<string>;
  cache: Map<string, unknown>;
}

const g = globalThis as unknown as { __huzhiDb?: DbGlobal };
const db: DbGlobal = (g.__huzhiDb ??= {
  loaded: new Set(),
  cache: new Map(),
});

function fileOf(name: string): string {
  return join(DATA_DIR, `${name}.json`);
}

/** 读取集合（首次从磁盘加载，之后命中内存缓存）。 */
export function loadCollection<T>(name: string, fallback: T): T {
  if (db.loaded.has(name)) return (db.cache.get(name) as T) ?? fallback;
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

/** 变更集合：更新缓存并立即原子落盘（同步写，量小可接受）。 */
export function saveCollection(name: string, value: unknown): void {
  db.cache.set(name, value);
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const tmp = fileOf(name) + ".tmp";
    writeFileSync(tmp, JSON.stringify(value), "utf8");
    renameSync(tmp, fileOf(name)); // 原子替换，进程被杀也不会写坏
  } catch {
    // 磁盘异常不阻塞游戏逻辑
  }
}
