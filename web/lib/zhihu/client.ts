// 知乎开放平台统一客户端。
//
// 为什么要这一层：此前 hot.ts / search.ts 各自拼 Bearer 头、各自处理错误、
// 各自写降级，新增一个 API 就要复制一遍。而开放平台的鉴权、错误码、额度语义
// 是完全统一的（见 skills/zhihu/references/http-api.md），应该只实现一次。
//
// 统一约定（文档核验时间 2026-07-16 + 2026-09-13 官网复核）：
//   - Authorization: Bearer <access_secret>
//   - X-Request-Timestamp: 秒级 Unix，与服务端相差不能超过 10 分钟
//   - 响应统一为 { Code, Message, Data }，Code=0 表示成功
//
// 安全约束：出站域名写死为常量 developer.zhihu.com，不接受任何用户可控 URL（防 SSRF）。

const API_BASE = "https://developer.zhihu.com/api/v1";
const CHAT_ENDPOINT = "https://developer.zhihu.com/v1/chat/completions";

/** 开放平台错误码（六个接口共用） */
export const ZHIHU_ERROR: Record<number, string> = {
  0: "成功",
  10001: "参数错误",
  20001: "鉴权或授权失败",
  30001: "调用频率、并发限制或当日额度超过限制",
  30002: "额外配置的累计成功次数额度耗尽",
  30003: "请求被风控拒绝",
  90001: "服务内部错误",
};

export interface ZhihuEnvelope<T> {
  Code: number;
  Message: string;
  Data: T;
}

export class ZhihuApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly api: string,
  ) {
    super(message);
    this.name = "ZhihuApiError";
  }

  /** 额度类错误：调用方应停止重试并降级，而不是继续打 */
  get isQuota(): boolean {
    return this.code === 30001 || this.code === 30002;
  }

  /** 面向用户的中文提示（不泄漏内部错误串） */
  get userMessage(): string {
    if (this.isQuota) return "今天这项能力的额度用完了，先用本地内容顶上";
    if (this.code === 20001) return "知乎凭证无效，请检查配置";
    if (this.code === 30003) return "这次请求被风控拦下了";
    return "知乎服务暂时没响应";
  }
}

export function hasCredential(): boolean {
  return Boolean(process.env.ZHIHU_ACCESS_SECRET);
}

function authHeaders(): HeadersInit {
  const secret = process.env.ZHIHU_ACCESS_SECRET;
  if (!secret) throw new ZhihuApiError(20001, "未配置 ZHIHU_ACCESS_SECRET", "auth");
  return {
    Authorization: `Bearer ${secret}`,
    // 秒级时间戳；服务端要求与其时间相差不超过 10 分钟
    "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
    "Content-Type": "application/json",
  };
}

/**
 * GET 一个开放平台内容接口。
 * @param path 形如 "content/zhihu_search"，只允许字母数字下划线与斜杠
 */
export async function apiGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  timeoutMs = 12000,
): Promise<T> {
  if (!/^[a-z0-9_/]+$/i.test(path)) {
    throw new ZhihuApiError(10001, "非法的接口路径", path);
  }
  const url = new URL(`${API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      headers: authHeaders(),
      signal: ctl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new ZhihuApiError(90001, `HTTP ${res.status}`, path);

    const json = (await res.json()) as ZhihuEnvelope<T>;
    if (json.Code !== 0) {
      throw new ZhihuApiError(json.Code, json.Message || ZHIHU_ERROR[json.Code] || "未知错误", path);
    }
    return json.Data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 直答（Chat Completions）。
 * 注意：直答走独立的 /v1/chat/completions 路径，响应是 OpenAI 兼容格式而非
 * { Code, Message, Data } 信封 —— 这是文档里唯一的例外，不要套用 apiGet。
 */
export type ZhidaModel = "zhida-fast-1p5" | "zhida-thinking-1p5" | "zhida-agent";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function zhidaChat(
  messages: ChatMessage[],
  model: ZhidaModel = "zhida-fast-1p5",
  timeoutMs = 30000,
): Promise<{ content: string; reasoning?: string; model: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ model, messages, stream: false }),
      signal: ctl.signal,
      cache: "no-store",
    });

    const json = (await res.json()) as {
      choices?: { message?: { content?: string; reasoning_content?: string } }[];
      model?: string;
      error?: { message?: string; code?: string };
    };

    if (json.error) {
      throw new ZhihuApiError(90001, json.error.message ?? "直答调用失败", "zhida");
    }
    const choice = json.choices?.[0]?.message;
    if (!choice?.content) throw new ZhihuApiError(90001, "直答返回为空", "zhida");

    return {
      content: choice.content,
      reasoning: choice.reasoning_content,
      model: json.model ?? model,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 额度查询：这个接口本身不消耗业务额度，可以放心调用
// ---------------------------------------------------------------------------

/** 可查询的额度项（与文档一一对应） */
export type QuotaApiId =
  | "global_search"
  | "zhihu_search"
  | "hot_list"
  | "question_answers"
  | "user_data"
  | "creator"
  | "zhida_openai"
  | "knowledge"
  | "tools";

export interface QuotaItem {
  APIID: string;
  APIName: string;
  TotalQuota: number;
  TotalUsed: number;
  RemainingQuota: number;
}

/** 查询当日剩余额度。不传 ids 时返回全部。 */
export async function getQuota(ids?: QuotaApiId[]): Promise<QuotaItem[]> {
  return apiGet<QuotaItem[]>("quota", ids?.length ? { APIIDs: ids.join(",") } : {});
}

// ---------------------------------------------------------------------------
// 轻量缓存：额度金贵，同样的查询别打两次
// ---------------------------------------------------------------------------

const g = globalThis as unknown as {
  __zhihuCache?: Map<string, { at: number; value: unknown }>;
  __zhihuInflight?: Map<string, Promise<unknown>>;
};

function cache() {
  return (g.__zhihuCache ??= new Map());
}
function inflight() {
  return (g.__zhihuInflight ??= new Map());
}

/**
 * 带缓存与并发去重的调用包装。
 * 额度耗尽（30001/30002）时返回过期缓存而不是抛错——有旧数据总比空白好。
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache().get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;

  const pending = inflight().get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const task = (async () => {
    try {
      const value = await fn();
      cache().set(key, { at: Date.now(), value });
      return value;
    } catch (e) {
      if (hit) return hit.value as T; // 过期缓存兜底
      throw e;
    } finally {
      inflight().delete(key);
    }
  })();

  inflight().set(key, task);
  return task;
}
