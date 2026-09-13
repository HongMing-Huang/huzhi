import { NextResponse } from "next/server";
import { getQuota, hasCredential, ZhihuApiError } from "@/lib/zhihu/client";

export const dynamic = "force-dynamic";

/**
 * 知乎开放平台能力总览。
 *
 * 用途有二：
 *   1. 给评委/接入方一个可验证的"我们到底用了哪些知乎能力"的入口
 *   2. 运维自查：额度还剩多少、哪项能力已经降级
 *
 * 额度查询接口本身不消耗业务额度，可以放心轮询。
 */

/** 本项目实际接入的能力清单（与代码一一对应，不写没接的） */
const CAPABILITIES = [
  {
    apiId: "hot_list",
    name: "知乎热榜",
    endpoint: "GET /api/v1/content/hot_list",
    usedIn: "信息流话题来源、对局话题池",
    module: "lib/zhihu/hot.ts",
  },
  {
    apiId: "zhihu_search",
    name: "知乎搜索",
    endpoint: "GET /api/v1/content/zhihu_search",
    usedIn: "信息流真人内容池（真实知乎回答）",
    module: "lib/zhihu/search.ts",
  },
  {
    apiId: "global_search",
    name: "全网搜索",
    endpoint: "GET /api/v1/content/global_search",
    usedIn: "判断辅助：为争议话题补充外部证据",
    module: "lib/zhihu/discovery.ts",
  },
  {
    apiId: "zhida_openai",
    name: "知乎直答",
    endpoint: "POST /v1/chat/completions",
    usedIn: "Agent 居民的高质量内容生成（低频，走缓存）",
    module: "lib/zhihu/discovery.ts",
  },
  {
    apiId: "creator",
    name: "问题推荐",
    endpoint: "GET /api/v1/user/question_recommendations",
    usedIn: "同频匹配的话题种子、Agent 选题",
    module: "lib/zhihu/discovery.ts",
  },
  {
    apiId: "question_answers",
    name: "问题回答",
    endpoint: "GET /api/v1/content/question_answers",
    usedIn: "真人内容池扩充：取热榜问题下的真实回答",
    module: "lib/zhihu/discovery.ts",
  },
] as const;

export async function GET() {
  if (!hasCredential()) {
    return NextResponse.json({
      configured: false,
      capabilities: CAPABILITIES.map((c) => ({ ...c, quota: null })),
      note: "未配置 ZHIHU_ACCESS_SECRET，全部能力运行在降级模式（本地语料）",
    });
  }

  try {
    const quotas = await getQuota();
    const byId = new Map(quotas.map((q) => [q.APIID, q]));

    return NextResponse.json({
      configured: true,
      capabilities: CAPABILITIES.map((c) => {
        const q = byId.get(c.apiId);
        return {
          ...c,
          quota: q
            ? {
                total: q.TotalQuota,
                used: q.TotalUsed,
                remaining: q.RemainingQuota,
                // 低于 10% 时提示，避免演示当天突然全线降级
                low: q.TotalQuota > 0 && q.RemainingQuota / q.TotalQuota < 0.1,
              }
            : null,
        };
      }),
      checkedAt: Date.now(),
    });
  } catch (e) {
    const err = e instanceof ZhihuApiError ? e : null;
    return NextResponse.json(
      {
        configured: true,
        capabilities: CAPABILITIES.map((c) => ({ ...c, quota: null })),
        error: err?.userMessage ?? "额度查询失败",
      },
      { status: 200 }, // 不让状态页本身 5xx，它只是自查工具
    );
  }
}
