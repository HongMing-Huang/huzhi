# 知乎开放平台 API 接入结构（v34）

> 文档核验：2026-09-13 用真实凭证实调全部六个接口，每项均返回 `Code: 0`（见下方额度快照）。
> 官方文档：<https://developer.zhihu.com/docs>
> 权威依据：skills/zhihu/references/（随 Skill 下发的官方一手文档）+ `GET /api/v1/quota` 实测。
> 收口状态：热榜 / 搜索 / 全网搜索 / 直答 / 问题推荐 / 问题回答 **六个接口已全部走 client.ts 统一底座**，无重复鉴权代码。

## 一、分层结构

```
web/lib/zhihu/
├── client.ts       ← 统一底座：鉴权 / 错误码 / 缓存 / 额度
├── hot.ts          ← 知乎热榜（业务封装）
├── search.ts       ← 知乎搜索（业务封装）
├── discovery.ts    ← 全网搜索 + 直答 + 问题推荐 + 问题回答
└── works.ts        ← 黑客松盐言故事（免鉴权，独立域名）
```

**为什么要 `client.ts` 这一层**：开放平台的鉴权（Bearer + 时间戳）、错误码、
额度语义、缓存与并发去重完全统一，应该只实现一次。曾经 `hot.ts` / `search.ts`
各自拼 Bearer 头、各自写降级，已于 v34 收口——现在六个接口全部经由
`apiGet()` / `cached()` / `zhidaChat()`，业务文件只保留字段映射与各自的降级策略。

## 二、统一鉴权（所有接口一致）

```
Authorization: Bearer <ZHIHU_ACCESS_SECRET>
X-Request-Timestamp: <秒级 Unix，与服务端相差 ≤10 分钟>
Content-Type: application/json
```

响应统一为信封结构 `{ Code, Message, Data }`，`Code=0` 为成功。

⚠️ **唯一例外**：直答走 `/v1/chat/completions`，返回 OpenAI 兼容格式，
不是信封结构——所以 `zhidaChat()` 单独实现，不套用 `apiGet()`。

## 三、六大能力接入明细

| 能力 | 端点 | 用在哪 | 缓存 | 日额度 | 额度归属(APIID) |
|---|---|---|---|---|---|
| **知乎热榜** | `GET /api/v1/content/hot_list` | 信息流话题、对局话题池 | 10 min | 100 | `hot_list` |
| **知乎搜索** | `GET /api/v1/content/zhihu_search` | 信息流真人内容池 | 30 min | 5000 | `zhihu_search` |
| **全网搜索** | `GET /api/v1/content/global_search` | 判断辅助的外部证据 | 30 min | 5000 | `global_search` |
| **知乎直答** | `POST /v1/chat/completions` | Agent 高质量内容生成 | 60 min | 100 | `zhida_openai` |
| **问题推荐** | `GET /api/v1/user/question_recommendations` | 同频匹配话题种子 | 2 h | 100 | `creator`（创作能力） |
| **问题回答** | `GET /api/v1/content/question_answers` | 真人池补充同题多方观点 | 30 min | 100 | `question_answers` |
| 额度查询 | `GET /api/v1/quota` | 自查（**不消耗业务额度**） | — | — | — |

> 注：**问题推荐 / 问题回答是黑客松扩展接口**，未收进 Skill 的静态 markdown，
> 但服务端真实存在且可调（2026-09-13 实测 `Code: 0`）。问题推荐走「创作能力」
> `creator` 额度、问题回答有独立 `question_answers` 额度项，二者均 100 次/日。
> 直答归属 `zhida_openai`，实测邀测额度为 5000 次/日。

实调额度快照（2026-09-13 `GET /api/v1/quota` 实测）：

```
global_search  1/5000        hot_list          52/100
zhihu_search   105/5000      question_answers  4/100
creator(问题推荐) 3/100       zhida_openai(直答) 0/5000
user_data      1/10000       knowledge         0/500      tools  0/10
```

## 四、关键实现细节

### 1. 问题推荐：空字符串 ≠ 不传

文档明确区分三种情况，实现里必须显式处理：

```ts
const cleaned = topic?.trim();
// 不传 Query → 按账号画像推荐
// 传主题     → 按主题推荐
// 传空白     → 服务端返回 10001
apiGet("user/question_recommendations", {
  Query: cleaned || undefined,   // 空串转 undefined，不透传
  Count: Math.min(20, Math.max(1, count)),
});
```

实调验证两种模式都可用：
- 画像模式 → "和 AI 相比，我们作为人类的核心竞争力是什么？"
- 主题模式（人工智能）→ "未来三十年内，哪些行业的工作人员可能会被人工智能取代？"

### 2. 问题回答：必须用服务端分页字段

文档警告：无摘要的回答会被服务端过滤，**单页条数可能少于 Limit 甚至为空**。
因此绝不能按 `Items.length` 自行推算偏移：

```ts
const incomplete = paging.IsEnd === false && paging.NextOffset === undefined;
return {
  isEnd: incomplete ? true : paging.IsEnd,  // 分页信息不完整时主动收敛
  nextOffset: paging.NextOffset,            // 只用服务端给的偏移
  degraded: incomplete,
};
```

### 3. 额度耗尽时返回过期缓存，而不是抛错

```ts
export async function cached<T>(key, ttlMs, fn) {
  const hit = cache().get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  try {
    const value = await fn();
    cache().set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    if (hit) return hit.value;   // ← 有旧数据总比空白好
    throw e;
  }
}
```

`ZhihuApiError.isQuota` 区分 30001/30002，调用方据此停止重试而非继续打。

### 4. 防 SSRF

- 出站域名写死为常量，不接受任何用户可控 URL
- `apiGet` 路径白名单：`/^[a-z0-9_/]+$/i`
- 问题回答只接受 `https://www.zhihu.com/question/\d+` 格式的链接
- 盐言故事 `work_id` 白名单：`/^[A-Za-z0-9_-]{1,64}$/`

### 5. 错误提示不泄漏内部信息

```ts
get userMessage(): string {
  if (this.isQuota) return "今天这项能力的额度用完了，先用本地内容顶上";
  if (this.code === 20001) return "知乎凭证无效，请检查配置";
  if (this.code === 30003) return "这次请求被风控拦下了";
  return "知乎服务暂时没响应";
}
```

比赛检查项要求"接口失败有真实的错误或降级提示，禁止泄漏英文错误串"。

## 五、自查入口

`GET /api/zhihu/status` 返回六大能力的接入位置与实时额度，
供评委验证"到底用了哪些知乎能力"，也供运维自查。
额度低于 10% 时标记 `low: true`。

## 六、额度纪律

| 原则 | 做法 |
|---|---|
| 高额度接口正常用 | 搜索类 5000/日，缓存 30 min |
| **低额度接口省着用** | 热榜/问题推荐/问题回答仅 100/日，缓存 10 min–2 h |
| 直答不做高频生成 | 信息流 Agent 帖仍走本地模板，直答只用于低频高质量场景 |
| 并发去重 | 同一 key 同时只发一次真实请求 |
| 额度耗尽降级 | 返回过期缓存 + 人话提示，不重试 |

## 七、尚未接入的能力

诚实标注，这些文档里有但本项目没用：

- 用户数据 API（创作/关注/收藏）—— 需 OAuth 授权，当前未接
- 知识库 API（上传/检索）—— 场景不匹配
- 小工具（PDF 解析 / PPT 生成）—— 场景不匹配
- MCP / Skill 形态 —— 本项目直接走 HTTP，不经 CLI
