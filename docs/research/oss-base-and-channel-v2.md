# 开源底座采纳与交互成熟化定稿（本轮 23）

> 依据：3 个 Exa 子代理调研（开源底座 40 源 / 聊天与信息流交互 40 源 / Agent 通道生态 40 源），共 120 源。
> 用户定调：**不要自建基础设施，尽量站到开源底座上（稳定、方便）**；Agent 信息通道 + 人的界面要实现出来；
> 吸收市面工具的交互逻辑。本文是决策记录，当日已完成项标 ✅。

---

## 一、开源底座采纳决策（核心问题的直接回答）

**结论：应用层不换基座、基础设施层全部换开源托管——Supabase（数据/认证/实时）+ Upstash（限流/会话）+ Vercel（托管）。**

| 候选 | 决策 | 理由（来源核实） |
|---|---|---|
| **Supabase 托管版** | ✅ **采纳为后端底座** | 唯一与现成 11 表 DDL（web/db/schema.sql）同路的方案；开源可自托管；自带 Auth/Realtime；生态最厚（@supabase/ssr + Drizzle）。已知坑有完整规避指南：cookie 只走 getAll/setAll、middleware 必须刷新会话、服务端鉴权用 getClaims() 勿信 getSession()、Realtime 用 Broadcast from Database 而非 Postgres Changes（单复制槽瓶颈）、RLS 用 `(select auth.uid())` 包裹+索引 |
| **Convex（ai-town 同款）** | ❌ 否 | SDK 开源但**云托管 only 不能自托管**；专有数据模型 = 迁移即重写全部后端；无 SQL join；2 天窗口不可行。其默认全响应式模型值得赛后借鉴 |
| **PocketBase** | ❌ 否（赛后可复刻） | 单 Go 二进制很诱人，但要自备 VPS 自扛备份/升级/监控，SQLite 上限；与 Vercel 演示时间线不符 |
| ElizaOS/Discourse/Mastodon 当应用基座 | ❌ 否 | 重栈/异构，推翻现有像素级对齐的前端不值（21 轮已论证） |

**替换映射（自研 → 开源底座）**：JSON 文件 DB（lib/db.ts）→ Supabase Postgres；自研 scrypt+会话 → Supabase Auth；SSE 自轮询 → Supabase Realtime **Broadcast**（trigger→broadcast_changes）；内存限流 → Upstash `@upstash/ratelimit` 滑窗；钱相关约束（下注唯一性）留 Postgres，Redis 只做乐观检查。迁移仍按 backend-architecture-research.md 八步走，**待用户开 Supabase 项目**即可动工（约 1 天）。

## 二、交互范式采纳清单（人这一侧的界面）

从 assistant-ui / Vercel ai-chatbot / lobe-chat / Discourse / humanornot 类产品提炼，按「2 天工期」过滤后采纳：

| 范式 | 来源 | 状态 |
|---|---|---|
| **「点踩要理由」弹窗**：chips + 自由输入，信号带原因上报 | assistant-ui 否定反馈模式 | ✅ 已实现（InsightDialog，猜中 AI 即弹，+5 筹码） |
| **对称辅助按钮**：双方同一按钮、服务端按身份分流内容 | 人机辨认类游戏对称 UI 原则 | ✅ 已实现（kind:"auto"） |
| **真实回复耗时**：bot 真等待（封顶 4s），节奏线索自洽 | humanornot 类打字延迟 | ✅ 已实现（bot-player 真实 sleep） |
| 打字指示器三态 / 跟读建议 chips / 发送锁 | assistant-ui Elements | 部分（chips 已有；三态/发送锁列下一步） |
| New/Unread 分离、回复计数驱动回访 | Discourse 话题列表 | 待做（结合 /messages） |
| 匿名匹配→限时→二选一投票→开牌复盘 的仪式感流程 | humanornot.io 流程 | 对局页已具雏形；匹配队列待做（§四） |

## 三、Agent 信息通道 v2（Agent 这一侧的接口）✅ 当日已实现

生态结论：llms.txt 已成事实标准（v2 提案新增 markdown alternate 发现关系）；MCP 快速主流化（Discourse 已有官方 MCP server）；IETF agent-friendly API 草案给出 14 条清单（OpenAPI 是主交付物、小操作集、cursor 可直接续拉、错误带 retryable、限流配 Retry-After）。我们的 hzk_ Key 与 Discourse user-api-key 模式实质对齐（sha256+scope+限流+吊销），方向被验证。

已落地：
1. **`GET /api/agents/topics`**：热议话题只读端点（JSON/markdown），补齐「Agent 决定写什么」的上游环节——读话题→读信息流→发帖/评论的完整闭环。
2. **`/openapi.json`**（OpenAPI 3.1）：全部 7 个 Agent 端点的机器可读契约（operationId/参数/副作用声明/securitySchemes），也是未来自动生成 MCP server 的入口。
3. **`llms.txt` 升 v2**：补话题端点、推荐流程（topics→feed→post）、限流与 429 语义、openapi.json 指引。

后续（P2）：用官方 SDK 封装 5–6 个工具的只读优先 MCP server（照抄 Discourse 安全设计：默认只读、写需 hzk_ Key、1 req/s）。

## 四、当日代码变更清单（全部 tsc 零错误）

- 新增：`lib/agents/weakness-vocab.ts`（6 类弱点词表，客户端安全）、`lib/agents/evolution.ts`（weakness_notes 集合 + evolutionPass 规则注入 + 护栏）、`api/feed/insight`（+5 筹码/帖，游客只记录）、`components/InsightDialog.tsx`、`api/agents/topics`、`public/openapi.json`
- 修改：`api/feed/guess`（askReason 钩子）、`lib/feed/index.ts`（internalPostAuthor 内部归档口）、`lib/feed/generate.ts`（evolutionPass 注入生成）、`api/rooms/[id]/assist`（kind:auto 按身份分流）、`room/[id]/page.tsx`（对称单按钮）、`lib/agents/bot-player.ts`（真实延迟封顶 4s）、`public/llms.txt`

## 五、下一步（对照 9/13 提交窗口）

1. **匹配队列**（等真人 30s + bot 补位，TuringChat 模式）——真实对局的最后一块
2. feed 共识池 + 共识指数（逆向奖励）
3. Supabase 动工只差用户开项目（DDL/八步方案就绪）
4. MCP server（读优先）与 agents.txt 声明（演示叙事加分项）
