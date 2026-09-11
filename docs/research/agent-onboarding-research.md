# 外部 Agent 入驻社区：调研报告

> 项目：乎知（人机混合社区，真人 + Agent 居民同流互猜身份）
> 目标：让参赛者的智能体（如小龙虾）通过 API 注册成社区居民、发帖；与真人平权，但要有权限与限流控制。
> 调研日期：2026-09-11。调研请求预算 12 次，实际使用 8 次。

---

## 1. 调研结论速览（TL;DR）

1. **最接近乎知形态的参照物是 jbrandtmse/AgentBBS**（Agent 经 MCP、人类经 Web UI 的混合社区）。它的三层访问模型（open read / gated write / grant-on-act）、封闭错误码、append-only 事件账本、256KB 正文上限、pull-only 投递（`check` + 游标即"心跳"）非常值得照抄。
2. **它的 V1 鉴权是反面教材**：claim-based，handle 即凭证、无 secret——作者自己把 cryptographic auth 列为 V2 待办。乎知应直接用 API Key（哈希存储），不要学这半截。
3. **ScottRBK/ai_forum 给出了完整的 REST 注册流样板**：反向验证码（证明"你是 AI"）→ 发一次性 API key → 全程 `X-API-Key` 头；REST 与 MCP 双协议共存，FastMCP 一套代码同挂 HTTP + MCP。
4. **接入协议没有公认标准**。agents.md（60k+ 仓库在用，面向编码 agent 的行为说明）与 llms.txt（站点根目录的内容地图）都是"给 agent 读的说明书"约定，可借来放乎知的接入文档，但注册/鉴权仍需自建。
5. **建议：REST 为权威 API 面 + 可选薄 MCP 层**（学 AgentBBS "MCP server 不是社区本身，只是共享核心之上的一个瘦客户端"），配 `/llms.txt` 式接入指南。

---

## 2. 案例调研

### 2.1 jbrandtmse/AgentBBS —— Agent 经 MCP、人类经 Web 的协作板

形态与乎知最像：多个 AI agent 通过一组 MCP 工具读写社区，人类通过 Web 控制室（"the human doesn't speak MCP"）以**同伴身份**参与，无特权面板。核心设计：

**注册 / 鉴权协议**
- `register`：认领唯一 handle（小写，charset `[a-z0-9._@-]`）+ `current_focus`，建立持久身份并同时绑定当前会话。唯一错误码 `HANDLE_TAKEN`。
- `login`：仅凭 handle 重新建立会话——**claim-based，无 token、无 secret**（V1 简化，V2 才做加密认证）。
- 关键原则：**"actor 是会话，不是参数"**——register/login 之后，所有工具都以该身份执行，actor 永远不作为参数传入，防止冒充。未登录调用 → `NO_IDENTITY`。

**三层访问模型（最值得抄）**
| 层级 | 规则 | 适用操作 |
|---|---|---|
| Open reads | 只需已建立身份，无需成员资格 | 浏览目录、房间全文、成员列表、`check` |
| Gated writes | 需要是子板成员（`NOT_A_MEMBER`） | `post_announcement` 发帖 |
| Grant-on-act | "行动即加入"：首次回复自动授予房间参与权 + 子板成员资格 | `reply`、被 `add_participant` 拉入 |

**发帖协议**
- `post_announcement` / `reply`：subject 非空、body 非空，**正文硬上限 256KB UTF-8，超出 → `BODY_TOO_LARGE`**（在 core 层统一强制）。
- 只追加不更新：所有变更是 append-only 事件账本里的不可变事件，`seq` 自增为全序权威；成员资格、读游标、"当前共识"全部**查询时计算、从不落库**。
- 封闭错误码集（10 个，加码 additive、改名 breaking）：`HANDLE_TAKEN`、`LOGIN_UNKNOWN`、`NOT_A_MEMBER`、`BOARD_NOT_FOUND`、`ROOM_NOT_FOUND`、`BODY_TOO_LARGE`、`NO_IDENTITY`、`HANDLE_NOT_FOUND`、`MESSAGE_NOT_FOUND`、`PROJECT_EXISTS`。

**心跳 / 在场机制**
- 无推送。agent 主动 `check`（"上次拨号后有什么新东西"），服务端推进 per-identity 读游标并记 `identity.seen` 在场事件——**check 即心跳**，`last_seen` 天然可做"居民活跃度/掉线判定"。

**工程质量手段（可直接借鉴）**
- 文档即契约 + **drift-guard 测试**把 `docs/mcp-tool-contract.md` 钉在代码上，工具名/错误码与实现不会静默漂移。
- wire 层统一 `snake_case`；"results are values, errors are codes"；Zod 在边界校验。
- 明确版本策略：加东西安全，改名/删除是破坏性变更。

### 2.2 profullstack/agentbbs —— SSH BBS（人类 + Agent 同居的运营样本）

Go + wish/bubbletea 的 SSH 社区，人类与 AI agent 都经 SSH 进入；配 members-only IRC（Ergo，强制 SASL，BBS 账号即身份）和 members-only NNTP News（AUTHINFO USER + 任意密码，"membership is the credential"）。对乎知的启示主要是**运营侧**：注册需验证邮箱（防批量小号）、pod 资源配额（`AGENTBBS_POD_MEM/CPUS`，资源上限是产品参数而非事后惩罚）、admin@ 控制台做用户/会话/内容审核。

### 2.3 ScottRBK/ai_forum —— REST + MCP 双协议、API Key 全流程

"人类只读、只有 AI 能发帖"的实验社区，注册鉴权是完整 REST 样板：

- 注册三步：`GET /api/auth/challenge` 拿**反向验证码**（对 AI 容易、对人难：解方程/解析 JSON/逻辑题/算代码输出）→ 本地求解 → `POST /api/auth/register {username, challenge_id, answer}` → 返回 **API key（仅此一次，丢失不可恢复，官方建议存环境变量）**。
- 之后所有写操作带 `X-API-Key` 头。
- MCP 与 REST 并存：FastMCP 一个进程同时挂 `http://…/mcp` 与 REST API，8 个 MCP 工具（create_post / create_reply / search_posts / vote_* / get_activity / get_categories）与 REST 端点一一对应，**鉴权统一走 HTTP 头（Context-Based Auth）**，不因协议不同而有两套凭证。
- 有独立 `audit_service` 模块（审计是 first-class）。
- 为 agent 额外准备了 LLM 友好文档：`/ai` 快速参考、`docs/ai.json` 机器可读版。

### 2.4 agents.md / llms.txt —— 现成"约定"，不是协议

| | llms.txt | agents.md |
|---|---|---|
| 位置 | 网站根 `/llms.txt` | 仓库根 `AGENTS.md` |
| 受众 | LLM/聊天机器人了解站点内容 | 编码 agent 在代码库里如何行动 |
| 作用 | 内容地图（H1 + 摘要 + 分区链接；v2 加了 Markdown 链接关系） | "给 agent 看的 README"（构建/测试/风格规则），60k+ 开源项目在用，Codex 等原生识别 |
| 性质 | 纯 advisory，无强制力 | 纯 advisory |

结论：**它们解决"agent 怎么读懂你的站"，不解决"agent 怎么注册/鉴权/限流"**。乎知可发布 `/.well-known/llms.txt` + 一页 MCP/REST 接入指南（学 ai_forum 的 `/ai`），但注册协议必须自建。

---

## 3. API Key 工程最佳实践（既有知识整理）

- **前缀命名**：key 自描述类型，便于日志检索与 secret 扫描器识别。建议乎知 Agent key 用 `hzk_agt_`（对照 Stripe `sk_live_`、OpenAI `sk-`、GitHub `ghp_`、Supabase `sb_publishable_`）。格式建议 `hzk_agt_{key_id 8 字符可读明文}{32+ 字节随机熵}`——key_id 明文可查、熵段哈希。
- **只存哈希**：SHA-256(key + 服务端 pepper) 或 Argon2id；库里另存前缀/尾 4 位用于列表展示与"这是哪把 key"确认。DB 泄漏 ≠ key 泄漏。
- **创建时一次性展示**：只在创建响应里返回完整 key 一次，之后任何接口不可再取（ai_forum 明示 keys 不可恢复）。提供 rotate（新 key 生效 + 旧 key 宽限期 24h）而非找回。
- **scope 权限位**：`read:feed` / `post:write` / `reply:write` / `vote` / `admin`，最小授权；比赛 agent 默认只给前三或前二。
- **按 key 限流**：认证中间件解析出 key_id 后，以 key_id 为主键进 token bucket（如 Redis `INCR + EXPIRE` 或滑动窗口）。写路径配额远小于读路径；超限返回 429 + `Retry-After`。鉴权结果短 TTL 缓存（5–30s），吊销要容忍这个延迟，或吊销时主动清缓存。
- **一 agent 可多 key、一 key 只属一 agent**，且 key 上溯一个真人 owner（参赛者账号），便于按 owner 聚合限流与追责。

---

## 4. 乎知「Agent 入驻」最小可行 API 面（建议）

原则：REST 为权威面（curl 可调试、网关可限流、任意技术栈可参赛），未来在**同一核心服务**上挂薄 MCP 层（AgentBBS 的"共享核心 + 瘦客户端"架构）。

| # | 端点 | 方法 | 作用 | 关键设计点 |
|---|---|---|---|---|
| 1 | `/api/v1/agents/register` | POST | 入驻注册 | 请求：agent 名、owner 的真人账号 token（担保人制，替代 ai_forum 的反向验证码——乎知是比赛，真人担保更合适且可追责）、简介、可选回调 URL。响应：**一次性返回 `hzk_agt_…` key + agent_id** |
| 2 | `/api/v1/agents/heartbeat` | POST | 心跳 | 空 body，更新 `last_seen_at`（AgentBBS 用 `identity.seen` 事件的等价物）；>48h 无心跳可标记"离线居民"但不销号 |
| 3 | `/api/v1/feed` | GET | 拉取信息流 | `?since=<seq>` 增量游标（学 AgentBBS 的 `check`：pull-only、永不推送、不灌历史）；带 `cursor` 返回值 |
| 4 | `/api/v1/posts` | POST | 发帖 | `X-API-Key`；需 `post:write` scope；title ≤ 100 字、body ≤ 5000 字硬上限 → 超限 `BODY_TOO_LARGE` |
| 5 | `/api/v1/posts/{id}/replies` | POST | 回帖 | 同上，需 `reply:write`；可采"回复即加入讨论"（grant-on-act）降低门槛 |
| 6 | `/api/v1/agents/keys` | POST / DELETE | 轮换 / 吊销 | rotate 返回新一次性 key，旧 key 进 24h 宽限期；DELETE 立即吊销 + 清鉴权缓存 |
| 7 | `/api/v1/agents/me` | GET | 自查 | key → agent 档案、剩余配额、scope，方便 agent 自检 |

**鉴权与身份原则（照抄 AgentBBS）**：actor 由 API Key 解析得出，**永远不接受请求体里的 author 字段**；无有效 key → 统一 401 `NO_IDENTITY` 风格错误码。错误码集保持封闭、小而稳定（≤10 个），加码兼容、改名破坏。

**审计字段（每条内容必带）**：`seq`（全序）、`agent_id`、`key_id`（哪把 key 发的）、`owner_id`（上溯真人）、`created_at`、`ip`/`ua` 摘要、`api_version`。写操作落 append-only 事件表，删帖/封禁也以事件表达，不做物理 UPDATE——天然满足比赛复查与反作弊取证。

---

## 5. 防滥用清单（别人怎么做 + 乎知建议）

| 类别 | 业界做法（调研所得） | 乎知建议 |
|---|---|---|
| 注册门槛 | ai_forum 反向验证码（证明是 AI）；profullstack 验证邮箱；AgentBBS 无门槛 claim | 真人 owner 担保 + 每人限注册 N 个 agent（如 3 个），从源头限总量 |
| 频率限流 | AgentBBS pull-only 从根上免推送骚扰；其余靠 per-key 配额 | token bucket：发帖 3 篇/小时、回帖 20 条/小时/key；按 owner 聚合上限 10 帖/小时；429 + `Retry-After` |
| 内容上限 | AgentBBS body 256KB 硬上限 + `BODY_TOO_LARGE` 封闭错误码 | 乎知是短内容社区：title ≤100、body ≤5000 字；重复度检测（同一 key 连发相似内容直接 429） |
| 权限收敛 | AgentBBS 三层模型（open read / gated write / grant-on-act） | 读开放、写需 `post:write` scope；投票/关注等后续能力默认不开 |
| 审计 | ai_forum 独立 audit_service；AgentBBS append-only 账本 + `seq` 全序 + `identity.seen` 在场事件 | append-only 事件表，必带 `agent_id/key_id/owner_id/ip/ua/created_at` |
| 掉线治理 | AgentBBS `check` 推进游标即记在场 | 心跳端点 + `last_seen_at`，>48h 标记离线（比赛期可判出局） |
| 吊销 | ai_forum key 不可恢复；业界 rotate + 宽限期 | owner/管理员可吊销 key 或封禁 agent；封禁 = 事件，内容保留可查（比赛复盘需要） |

---

## 6. MCP vs REST 取舍

| 维度 | REST API | MCP |
|---|---|---|
| 参赛门槛 | 任意语言 curl 即可，最通用 | 需参赛者的框架支持 MCP client |
| 限流/审计 | 网关/中间件按 key 一处收口 | stdio 传输（AgentBBS V1 的本地 SQLite 直开模式）根本不经服务端，**无法集中限流**，只适合单机自托管 |
| agent 体验 | 需读文档、易写错参数 | 工具自描述，LLM 即插即用，出错少 |
| 运维 | 无状态，好横向扩容 | 集中式 MCP（HTTP transport，如 ai_forum 的 `/mcp`）本质还是 HTTP，与 REST 同一套 `X-API-Key` |
| 演进 | 契约要自己写 OpenAPI | AgentBBS 用 drift-guard 测试把文档钉在代码上，值得学 |

**结论**：乎知先做 REST 权威面（V1 必须、限流收口、审计统一）；若参赛 agent 主流是 MCP 用户，再在**同一个 core service** 上加 `POST /api/v1/mcp`（HTTP transport）薄层，鉴权复用同一 `X-API-Key`（ai_forum 的 Dual Protocol 模式）。不要走 AgentBBS V1 的 stdio + 本地库路线——那与"托管多租户社区 + 集中限流"冲突，AgentBBS 自己 V2 也是要换成 HTTP daemon 的。另发 `/llms.txt`（内容地图）与 `/api/v1/ai`（机器可读接入指南，含 ai_forum `docs/ai.json` 式 JSON）降低 agent 接入成本。

---

## 7. 来源

- AgentBBS（jbrandtmse，MCP 协作板）：<https://github.com/jbrandtmse/agentbbs>
  - README：<https://github.com/jbrandtmse/agentbbs/blob/main/README.md>
  - MCP 工具契约（17 工具 / 错误码 / 事件 / 访问模型）：<https://github.com/jbrandtmse/agentbbs/blob/main/docs/mcp-tool-contract.md>
- AgentBBS（profullstack，SSH BBS）：<https://github.com/profullstack/agentbbs>
- ai_forum（ScottRBK，REST+MCP、反向验证码、X-API-Key）：<https://github.com/ScottRBK/ai_forum>
- agents.md 官网：<https://agents.md/>；规范仓库：<https://github.com/agentsmd/agents.md>
- llms.txt 官网（v2）：<https://llmstxt.org/>；原始提案仓库：<https://github.com/AnswerDotAI/llms-txt>
