// 知乎黑客松「盐言故事 / 知识」内容接入。
//
// 依据：skills/zhihu/references/hackathon-content-api.md
//   - 这组接口**不需要任何鉴权**（不用 Access Secret、不用 OAuth）
//   - 仅面向本次黑客松，赛后可能下线，因此必须有降级
//
// 安全约束（与 lib/zhihu/hot.ts 同一套）：
//   - 出站域名写死为常量 api.zhihu.com，不接受任何用户可控 URL
//   - work_id 必须来自列表接口，且拒绝含 / ? # 换行的值，再做 path 编码
//
// 版权边界（文档明确要求）：
//   - 如实保留作者、来源与归属，不把原文改写成"本站创作"
//   - 控制单次读取长度，接口失败时如实提示，不生成虚假正文

const BASE = "https://api.zhihu.com/km-indep-home/hackathon/v2";
const LIST_CACHE_MS = 30 * 60 * 1000;
const DETAIL_CACHE_MS = 60 * 60 * 1000;

export type ContentKind = "story" | "knowledge";

export interface WorkSummary {
  workId: string;
  title: string;
  artwork?: string;
  description?: string;
  labels: string[];
}

export interface WorkDetail {
  workId: string;
  chapterName: string;
  authorName: string;
  authorAvatar?: string;
  labels: string[];
  introduction: string;
  content: string;
}

interface ListCache {
  at: number;
  items: WorkSummary[];
}

const g = globalThis as unknown as {
  __huzhiWorkList?: Partial<Record<ContentKind, ListCache>>;
  __huzhiWorkDetail?: Map<string, { at: number; detail: WorkDetail }>;
  __huzhiWorkInFlight?: Map<string, Promise<unknown>>;
};

function listCache(): Partial<Record<ContentKind, ListCache>> {
  return (g.__huzhiWorkList ??= {});
}
function detailCache(): Map<string, { at: number; detail: WorkDetail }> {
  return (g.__huzhiWorkDetail ??= new Map());
}
function inFlight(): Map<string, Promise<unknown>> {
  return (g.__huzhiWorkInFlight ??= new Map());
}

/** work_id 必须是列表返回的单行标识；拒绝任何可能改变请求路径的字符 */
export function isSafeWorkId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

function pickLabels(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 12) : [];
}

/** 服务端可能把结果包在 data 里，也可能直接返回数组 —— 两种都兼容 */
function unwrap(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "data" in raw) {
    return (raw as { data: unknown }).data;
  }
  return raw;
}

async function fetchJson(url: string, timeoutMs = 12000): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ctl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export interface WorkListResult {
  items: WorkSummary[];
  degraded: boolean;
  reason?: string;
}

/** 拉取故事或知识列表（30 分钟缓存 + 并发去重 + 过期缓存兜底） */
export async function listWorks(kind: ContentKind): Promise<WorkListResult> {
  const cached = listCache()[kind];
  if (cached && Date.now() - cached.at < LIST_CACHE_MS) {
    return { items: cached.items, degraded: false };
  }

  const key = `list:${kind}`;
  const pending = inFlight().get(key) as Promise<WorkListResult> | undefined;
  if (pending) return pending;

  const task = (async (): Promise<WorkListResult> => {
    try {
      const raw = unwrap(await fetchJson(`${BASE}/${kind}/list`));
      if (!Array.isArray(raw)) throw new Error("响应格式异常");

      const items: WorkSummary[] = raw
        .map((x): WorkSummary | null => {
          const o = x as Record<string, unknown>;
          const workId = String(o.work_id ?? "");
          if (!isSafeWorkId(workId)) return null;
          return {
            workId,
            title: String(o.title ?? "无标题"),
            artwork: typeof o.artwork === "string" ? o.artwork : undefined,
            description: typeof o.description === "string" ? o.description : undefined,
            labels: pickLabels(o.labels),
          };
        })
        .filter((x): x is WorkSummary => x !== null);

      listCache()[kind] = { at: Date.now(), items };
      return { items, degraded: false };
    } catch (e) {
      // 过期缓存兜底：赛事接口不稳定时，宁可给旧数据也不给空白
      if (cached) {
        return { items: cached.items, degraded: true, reason: "内容服务暂时没响应，先显示上一次的结果" };
      }
      return {
        items: [],
        degraded: true,
        reason: `暂时取不到故事内容（${e instanceof Error ? e.message : "未知原因"}）`,
      };
    } finally {
      inFlight().delete(key);
    }
  })();

  inFlight().set(key, task);
  return task;
}

export interface WorkDetailResult {
  detail: WorkDetail | null;
  degraded: boolean;
  reason?: string;
}

/** 拉取单篇详情（含正文）。1 小时缓存。 */
export async function getWork(kind: ContentKind, workId: string): Promise<WorkDetailResult> {
  if (!isSafeWorkId(workId)) {
    return { detail: null, degraded: true, reason: "内容标识无效" };
  }
  const ck = `${kind}:${workId}`;
  const hit = detailCache().get(ck);
  if (hit && Date.now() - hit.at < DETAIL_CACHE_MS) {
    return { detail: hit.detail, degraded: false };
  }

  const pending = inFlight().get(`d:${ck}`) as Promise<WorkDetailResult> | undefined;
  if (pending) return pending;

  const task = (async (): Promise<WorkDetailResult> => {
    try {
      const raw = unwrap(await fetchJson(`${BASE}/${kind}/${encodeURIComponent(workId)}`));
      const o = (raw ?? {}) as Record<string, unknown>;
      const content = String(o.content ?? "");
      if (!content) throw new Error("正文为空");

      const detail: WorkDetail = {
        workId,
        chapterName: String(o.chapter_name ?? "未命名"),
        authorName: String(o.author_name ?? "佚名"),
        authorAvatar: typeof o.author_avatar === "string" ? o.author_avatar : undefined,
        labels: pickLabels(o.labels),
        introduction: String(o.introduction ?? ""),
        content,
      };
      detailCache().set(ck, { at: Date.now(), detail });
      return { detail, degraded: false };
    } catch (e) {
      if (hit) return { detail: hit.detail, degraded: true, reason: "内容服务暂时没响应，显示的是缓存版本" };
      return {
        detail: null,
        degraded: true,
        reason: `这篇暂时读不到（${e instanceof Error ? e.message : "未知原因"}）`,
      };
    } finally {
      inFlight().delete(`d:${ck}`);
    }
  })();

  inFlight().set(`d:${ck}`, task);
  return task;
}

/**
 * 把正文切成段落。
 * 盐言故事正文里有大量对话与短句，按空行与句末切分能保留原有节奏。
 *
 * 关键约束：**只在句末标点处切分，绝不硬切**。
 * 否则会切出「心跳依然在加」这样的半截句，在「代笔现场」玩法里
 * 这种残句会变成明显的作弊线索（玩家一眼就知道哪段被动过）。
 * 超长且无句末标点的段落宁可整段保留，也不截断。
 */
export function splitParagraphs(content: string, maxLen = 180): string[] {
  return content
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .flatMap((para) => {
      if (para.length <= maxLen) return [para];
      const out: string[] = [];
      let buf = "";
      // 前瞻断言保证标点跟在前一句末尾，切口永远落在完整句边界
      for (const seg of para.split(/(?<=[。！？…」』】])/)) {
        if (!seg) continue;
        if ((buf + seg).length > maxLen && buf) {
          out.push(buf);
          buf = seg;
        } else {
          buf += seg;
        }
      }
      if (buf) out.push(buf);
      return out.length ? out : [para];
    });
}
