// 知乎开放平台：此前未接入的四个能力。
//
//   1. 全网搜索 global_search        —— 外部证据，与站内搜索互补
//   2. 直答 zhida                     —— 生成能力
//   3. 问题推荐 question_recommendations —— 按画像或主题推荐可回答的问题
//   4. 问题回答 question_answers      —— 取一个问题下的真实回答列表
//
// 额度纪律（官网 2026-09-13 复核）：
//   - question_answers 走「知乎问题回答」额度，默认 100 次/日（未实名 10 次）
//   - question_recommendations 走「创作能力」额度，与本人创作统计共用，同为 100 次/日
//   - 因此这两个接口的缓存时间比搜索更长，且额度耗尽时必须降级而非重试

import { apiGet, cached, hasCredential, zhidaChat, ZhihuApiError, type ZhidaModel } from "./client";

// ---------------------------------------------------------------------------
// 1. 全网搜索
// ---------------------------------------------------------------------------

export interface GlobalSearchItem {
  Title: string;
  ContentType: string;
  ContentID: string;
  ContentText: string;
  Url: string;
  CommentCount: number;
  VoteUpCount: number;
  AuthorName: string;
  AuthorAvatar: string;
  EditTime: number;
  /** 权威等级：1 低 / 2 中 / 3 高 / 4 超高 */
  AuthorityLevel: string;
}

export interface GlobalSearchResult {
  items: GlobalSearchItem[];
  degraded: boolean;
  reason?: string;
}

/**
 * 全网搜索。
 * @param filter 高级筛选表达式，如 `publish_time>=1778494631`。
 *               注意 host=="zhihu.com" 不受支持，站内内容请用 zhihu_search。
 */
export async function globalSearch(
  query: string,
  count = 10,
  filter?: string,
): Promise<GlobalSearchResult> {
  if (!hasCredential()) {
    return { items: [], degraded: true, reason: "未配置知乎凭证" };
  }
  const key = `global:${query}:${count}:${filter ?? ""}`;
  try {
    const data = await cached(key, 30 * 60 * 1000, () =>
      apiGet<{ HasMore: boolean; Items: GlobalSearchItem[] }>("content/global_search", {
        Query: query,
        Count: Math.min(20, Math.max(1, count)), // 文档：最大 20
        Filter: filter,
      }),
    );
    return { items: data.Items ?? [], degraded: false };
  } catch (e) {
    const err = e instanceof ZhihuApiError ? e : null;
    return { items: [], degraded: true, reason: err?.userMessage ?? "全网搜索暂时不可用" };
  }
}

// ---------------------------------------------------------------------------
// 2. 直答
// ---------------------------------------------------------------------------

export interface ZhidaResult {
  content: string;
  reasoning?: string;
  degraded: boolean;
  reason?: string;
}

/**
 * 调用知乎直答。
 * 额度有限（走 zhida_openai 额度），只在真正需要生成时调用，
 * 不要用于高频内容生产——信息流的 Agent 帖仍走本地模板。
 */
export async function askZhida(
  question: string,
  model: ZhidaModel = "zhida-fast-1p5",
): Promise<ZhidaResult> {
  if (!hasCredential()) {
    return { content: "", degraded: true, reason: "未配置知乎凭证" };
  }
  try {
    // 同一问题 1 小时内不重复问，省额度
    const r = await cached(`zhida:${model}:${question}`, 60 * 60 * 1000, () =>
      zhidaChat([{ role: "user", content: question }], model),
    );
    return { content: r.content, reasoning: r.reasoning, degraded: false };
  } catch (e) {
    const err = e instanceof ZhihuApiError ? e : null;
    return { content: "", degraded: true, reason: err?.userMessage ?? "直答暂时不可用" };
  }
}

// ---------------------------------------------------------------------------
// 3. 问题推荐
// ---------------------------------------------------------------------------

export interface RecommendedQuestion {
  Title: string;
  Url: string;
}

export interface RecommendResult {
  questions: RecommendedQuestion[];
  /** 本次用的是画像推荐还是主题推荐 */
  mode: "profile" | "topic";
  degraded: boolean;
  reason?: string;
}

/**
 * 推荐适合回答的问题。
 *
 * 文档强调：不传 Query 与传空字符串含义不同——
 *   - 不传 → 按当前账号画像推荐
 *   - 传主题 → 按主题推荐
 *   - 传空白 → 返回 10001 参数错误
 * 所以这里对空白做显式处理，不把空字符串透传出去。
 */
export async function recommendQuestions(topic?: string, count = 5): Promise<RecommendResult> {
  if (!hasCredential()) {
    return { questions: [], mode: "profile", degraded: true, reason: "未配置知乎凭证" };
  }
  const cleaned = topic?.trim();
  const mode: "profile" | "topic" = cleaned ? "topic" : "profile";
  const key = `recommend:${mode}:${cleaned ?? ""}:${count}`;

  try {
    // 创作能力额度只有 100 次/日，缓存 2 小时
    const data = await cached(key, 2 * 60 * 60 * 1000, () =>
      apiGet<{ Items: RecommendedQuestion[] }>("user/question_recommendations", {
        Query: cleaned || undefined,
        Count: Math.min(20, Math.max(1, count)), // 文档：范围 1-20
      }),
    );
    return { questions: data.Items ?? [], mode, degraded: false };
  } catch (e) {
    const err = e instanceof ZhihuApiError ? e : null;
    return { questions: [], mode, degraded: true, reason: err?.userMessage ?? "问题推荐暂时不可用" };
  }
}

// ---------------------------------------------------------------------------
// 4. 问题回答
// ---------------------------------------------------------------------------

export interface AnswerItem {
  ContentType: string;
  ContentToken: string;
  Url: string;
  /** 服务返回的摘要或截取文本，**不是全文**，也不是 AI 生成 */
  Summary: string;
}

export interface AnswersResult {
  items: AnswerItem[];
  isEnd: boolean;
  nextOffset?: number;
  totals?: number;
  degraded: boolean;
  reason?: string;
}

/**
 * 取一个知乎问题下的回答列表。
 *
 * 分页纪律（文档明确要求）：
 *   - 无摘要的回答会被服务端过滤，单页条数可能少于 Limit 甚至为空
 *   - **必须**用 Paging.NextOffset，不要按 Items 数量自行计算偏移
 *   - IsEnd=false 但缺 NextOffset 时停止翻页并报告，避免重复请求
 */
export async function getQuestionAnswers(
  questionUrl: string,
  offset = 0,
  limit = 20,
): Promise<AnswersResult> {
  if (!hasCredential()) {
    return { items: [], isEnd: true, degraded: true, reason: "未配置知乎凭证" };
  }
  // 只接受知乎问题链接，防止被当作任意 URL 代理
  if (!/^https:\/\/www\.zhihu\.com\/question\/\d+/.test(questionUrl)) {
    return { items: [], isEnd: true, degraded: true, reason: "不是有效的知乎问题链接" };
  }

  const key = `answers:${questionUrl}:${offset}:${limit}`;
  try {
    const data = await cached(key, 30 * 60 * 1000, () =>
      apiGet<{
        Items: AnswerItem[];
        Paging: { IsEnd: boolean; NextOffset?: number; Totals?: number };
      }>("content/question_answers", {
        QuestionUrl: questionUrl,
        Offset: Math.max(0, offset),
        Limit: Math.min(50, Math.max(1, limit)), // 文档：范围 1-50
      }),
    );

    const paging = data.Paging ?? { IsEnd: true };
    // 分页信息不完整时主动收敛，不自行推算
    const incomplete = paging.IsEnd === false && paging.NextOffset === undefined;
    return {
      items: data.Items ?? [],
      isEnd: incomplete ? true : paging.IsEnd,
      nextOffset: paging.NextOffset,
      totals: paging.Totals,
      degraded: incomplete,
      reason: incomplete ? "服务端分页信息不完整，已停止翻页" : undefined,
    };
  } catch (e) {
    const err = e instanceof ZhihuApiError ? e : null;
    return { items: [], isEnd: true, degraded: true, reason: err?.userMessage ?? "问题回答暂时不可用" };
  }
}
