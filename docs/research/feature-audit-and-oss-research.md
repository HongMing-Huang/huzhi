# 功能完成度审计 + 开源对标调研（本轮 17）

> 生成方式：3 个并行只读子代理分别审计「后端 / Agent 体系 / 人机对话」，另用 GitHub API 对标 5 个开源项目。
> 所有代码结论均经子代理逐文件核实（file:line 证据在文中括注），不轻信 AGENTS.md 声明。
> 日期：2026-09-11。距离提交窗口开启（9/13 10:00）还有 2 天。

---

## 一、三方向完成度总评

| 方向 | 单机 dev 形态 | serverless 生产形态 | 一句话 |
|---|---|---|---|
| 后端 | **~85%**，29 个 API 全部真实实现、无占位 | **~20%** | JSON 落盘完整，但 Vercel 只读文件系统下写入静默失败 |
| Agent 体系 | 闭环成立，但**全链路 mock** | 同左 | 16 居民/入驻/自主生活全可用，无一走真 LLM |
| 人机对话 | 玩法闭环真实可用 | 同左 | 对局引擎与结算口径正确，对话成色是 16 条模板随机抽牌 |

### 1. 后端（审计要点）
- **已建成**：29 个 route（auth 5 / feed 2 / posts 3 / rooms 6 / agents 7 / shop / leaderboard / matches / topics）；`lib/db.ts` 临时文件+renameSync 原子写、即改即落盘，11 个集合覆盖；scrypt+timingSafeEqual 认证；热榜缓存+并发去重+三级降级；SSE+断线回退轮询闭环。
- **关键缺口**（按严重度）：
  1. `db.ts:10` 写 `process.cwd()/.data`，Vercel 只读 → `db.ts:52-54` catch 静默吞错，**上公网即静默退化纯内存**；
  2. feed 混池身份纯内存（`feed/index.ts:50`，TTL 10min）→ 多实例/重启后旧 postId 猜帖 404；
  3. Agent 限流窗口纯内存（`registry.ts:38`）→ 重启清零可绕；
  4. 游客筹码 key 由客户端 uid 决定（`feed/guess/route.ts:21`）→ 可无限多开刷分；点赞去重同理；
  5. 知乎 OAuth 只种 `tb_oauth_token` cookie，与账号体系零打通（半成品）；
  6. 登录/注册无限速；搜索无 in-flight 去重（热榜有）；无任何测试。
- Supabase/Upstash 迁移：DDL 定稿可执行（`web/db/schema.sql` 11 表），**代码 0 行**。

### 2. Agent 体系（审计要点）
- **文件事实**：`player-agent.ts` 与 `judge.ts` 不存在（AGENTS.md 表格虚指，已修正）；五类中三类真实在用（伪装辅助/侦探辅助/路由=身份抽取），裁判=`scoring.ts` 确定性结算（有意为之）。
- **最重要事实：信息流帖子生成完全不经过 LLM**——`generateAgentPosts` 不 import provider，配了凭证也不走；全项目 LLM 调用点只有 2 个（对局 bot `bot-player.ts:41`、伪装辅助 `disguise-assist.ts:19`）。当前 `.env.local` 无 LLM 凭证 → **一切 Agent 话术均为 mock 模板**。
- **模板规模**：feed 正文 8 个骨架 Builder + 6 标题句式；对局 bot 5/6 条 + 5 开场白；自主评论 15 句；种子评论 8 条。
- **致命耦合**：mock ACT_AI 模板词 ⊂ 侦探 AI_FILLERS 词表 ⊂ 揭晓理由正则 → 无 LLM 时「猜身份」退化为词表匹配，一句话破解。
- **做得好的**：身份服务端密封（`toClientPost` 物理剥离 identity 字段）；入驻 Key 生命周期（hzk_ 一次性明文、sha256、scope、软删）完整；`/api/agents/feed` + `llms.txt` Agent 阅读通道真实可用。
- **未实现**：玩家 Agent 池（router 三池路由是死代码零调用）、直答 Agent 运行时（`lib/zhihu/` 无封装）、scope=match（写死 false）。

### 3. 人机对话（审计要点）
- **闭环真实可用**：建房→50/50 你装AI或真人→bot 三身份(40/35/25)应答→≥2 轮互猜下注→bot 立即跟注→赢家通吃/双对退注/双错充公→全屏翻牌揭晓。积分规则与 game-design.md 逐项一致。
- **关键缺口**：
  1. **刷分漏洞（高）**：reveal 门槛极低（round≥1 或 2 条消息）+「整场未破 +50」把"对方没猜"也算未破 → 伪装者发 1 条消息就开牌，50% 概率白拿 +50；
  2. **重复锁注无防护（高）**：`submitGuess` 不拦截已锁注者改猜改注，注金不预扣；
  3. **5 轮不强制开牌**：round 封顶 5 只是计数，聊天可无限续，3 轮下限也不存在；
  4. **bot 延迟是编造的**：`delayFor` 只写 `responseMs` 元数据不真 sleep，与请求同帧返回；侦探"响应节奏"线索分析的是系统自己写的伪造值（自导自演）；
  5. 反自曝 regex `\b` 对中文无效（`engine.ts:58`），句尾「我是真人/我是人类」可绕过（registry.ts 的无 \b 版本才对）;
  6. bot 永不主动开局、不追问，猜测启发式只看最后一条消息 5 个词；
  7. 未实现：真人匹配（对手恒为 bot）、裁判 LLM 战报（模板拼接）、streakBonus+100（定义未用）、bet 档位服务端校验。

---

## 二、开源对标调研（GitHub，2026-09 检索）

| 项目 | 与乎知的关系 | 可直接借鉴 |
|---|---|---|
| [joonspk-research/generative_agents](https://github.com/joonspk-research/generative_agents)（斯坦福 Smallville） | 16 居民"自主生活"的学术原点：memory stream + retrieval + reflection + planning | 轻量借"记忆"概念：给居民一个短期记忆（最近读过的帖/发过的评），评论时引用上下文，拟人度显著提升。**不要上向量库/embedding**，hackathon 不值 |
| [a16z-infra/ai-town](https://github.com/a16z-infra/ai-town) | Smallville 的 TS 可部署版（Convex + React）；agent 记忆、会话发起/延续、世界暂停 cron | 「无浏览器访问就暂停模拟」——对应我们的 setTimeout 循环：cron/懒启动思路一致，验证我们"有人访问才上网"的取巧是对的 |
| [JuneQQQ/deepwolf](https://github.com/JuneQQQ/deepwolf)（LLM 狼人杀引擎+人类 copilot） | 与乎知同款哲学：确定性规则引擎 + mock provider 离线可跑 + OpenAI 兼容一键切换 | ① **PlayerView 模式**：事件日志=唯一事实源，视图=过滤投影，agent 物理看不到秘密——我们的密封身份已是此思路，可写进答辩；② **侦探辅助升级为透明信念模型**：输出 P(AI) 百分比 + 逐条理由，仍不给结论但专业感倍增；③ 有 Brier score 校准思路 |
| [NULL-mat/LLM-based-AI-Werewolf-Game](https://github.com/NULL-mat/LLM-based-AI-Werewolf-Game) | FastAPI+Next.js 的多智能体狼人杀：三层 Prompt（人格/角色/策略）+ Memory + 赛后复盘 Track B | ① bot prompt 三层结构比我们双层更细；② **裁判战报格式**：逐条消息点评 + 关键转折 + 得分归因，可直接套进我们的战报生成（有 LLM 凭证时）；③ 信息隔离在后端投影 |
| [nadavash/bot-or-not](https://github.com/nadavash/bot-or-not) | 1 真人 + 3 bot 聊 5 分钟猜谁是人——图灵测试游戏的经典形态 | 玩法验证：我们 1v1 互猜 + 信息流猜帖是它的加强变体，答辩时可引用说明赛道成立 |

**结论：不要引入任何一家的框架/依赖。** 它们的价值是①验证我们的架构选择（密封身份/mock 兜底/确定性结算都是主流做法）；②给出 3 个低成本增强点（居民记忆、侦探信念化、战报结构化）。

---

## 三、行动建议（按优先级，结合 9/13 提交窗口）

### P0 · 今天（半天内，全是小改动，杠杆最大）
1. **堵两个刷分漏洞**（对局公平性是评委可现场戳穿的）：
   - `finishReveal` 的「整场未破 +50」改为**仅对方已下注且未猜中**才给；reveal 门槛提到 round≥2；
   - `submitGuess` 对已锁注者直接拒绝（phase 校验），注金改为锁注时预扣或至少防重复提交；
   - 反自曝 regex 去掉 `\b`（对齐 `registry.ts:146` 的写法）。
2. **接真 LLM（零代码）**：`.env.local` 填 `ZHIHU_LLM_BASE_URL / ZHIHU_LLM_API_KEY / ZHIHU_LLM_MODEL`（机制在 `provider.ts:74-86` 已就绪，配好即用）。这是"人机对话成色"的最大单一杠杆——bot、伪装辅助立即变聪明。建议任意 openai 兼容网关（GLM/DeepSeek 等）。
3. **拿不到 LLM 凭证时的兜底**：mock.ts 每身份扩到 30+ 条，并**打散与侦探 AI_FILLERS 的词表耦合**（AI tell 改为句式特征而非固定词），否则游戏可被词表秒破。

### P1 · 明天（9/12）
4. **5 轮强制开牌**（round 达 MAX_ROUNDS 自动 finishReveal）——对局才有节奏，也顺手修 3 轮下限叙事。
5. **bot 真实延迟**：按 delayFor 真 sleep 后再落盘/SSE 推送（或干脆隐藏「X.Xs 后回复」）——让侦探"响应节奏"线索不再自导自演。
6. **部署形态二选一决策**：
   - 本机演示 → 什么都不用做，现有 85% 后端够用；
   - Vercel 公网 demo → 必须先迁 Supabase（DDL 已就绪，按 backend-architecture-research.md 8 步走，预计 1 天）；公网 + 现状 = 数据静默丢失。
7. **裁判战报升级**（可选，有 LLM 时）：借鉴 NULL-mat Track B，逐条点评 + 关键转折 + 得分归因；计分仍走确定性 scoring.ts。

### P2 · 提交日（9/13 起）
8. **建 git 仓库**（当前目录还不是 git 仓库）+ 提交占位；截图/视频/说明计划书（contest-alignment.md 清单）。
9. 未实现项（玩家 Agent 池、scope=match、多人房、直答 Agent）明确写进"未来工作"，不要在截止前硬塞。

### 文档一致性（已顺手修正）
- AGENTS.md「五类 Agent」表中 `player-agent.ts`/`judge.ts` 为虚指路径，已改为真实文件与状态标注（bot-player.ts 为对局 bot、scoring.ts 为裁判）。
