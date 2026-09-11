# 「图灵盲盒」技术调研报告

> 调研日期：2026-09-11 ｜ 目标：2 天内交付可公网访问的 1v1 社交推理游戏 Demo
> 玩法：人类装 AI / AI 装人 / 真实 LLM Agent 混池，互猜身份 + 扑克式下注积分

---

## 一、推荐技术栈定稿

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | **Next.js 16（App Router）+ TypeScript** | 前后端一体；Route Handler 直接代理 LLM 调用（密钥不出服务端）；Vercel 一键公网部署。同类爆款 AI 狼人杀 wolfcha 即此栈，可直接对标 |
| 样式 | **Tailwind CSS 4** | 手写聊天气泡极快，无需引入重型组件库 |
| UI 组件 | **shadcn/ui（Radix 底座）+ 手写聊天气泡** | Dialog（下注面板）、Toast（回合提示）、Card（积分板）用现成的省 2-4 小时；聊天区本身用 Tailwind 手写更贴游戏风格。wolfcha 同样是 Radix + Tailwind 组合 |
| 状态管理 | **Jotai**（可选）或 React useState/zustand | wolfcha 用 Jotai；对局页面状态简单，zustand 一个 store 足够，降低学习成本 |
| 实时通信 | **SSE（Route Handler + ReadableStream）为主，轮询为降级** | 详见第三节对比。socket.io 在 Vercel serverless 不可用 |
| 对局状态存储 | **Supabase（Postgres）或 Upstash Redis** | serverless 实例内存不共享、随时回收，对局状态必须落外部存储；wolfcha 也用 Supabase。免费额度够 Demo |
| LLM 接入 | **AI SDK（vercel/ai）或直接 fetch OpenAI 兼容接口** | 服务端统一封装 `chatWithPersona()`，支持多供应商（DeepSeek/Qwen/GPT），天然支持流式；便于做降级切换 |
| 部署 | **Vercel（免费 Hobby 计划）** | 公网 Demo 最快路径；注意 `maxDuration` 限制（见风险清单） |
| 知乎平台 | 服务端 Route Handler 持有 Access Secret（env），调 search/hot/answer 做题目素材与传播素材 | 密钥永不进客户端 |

**架构一句话**：客户端（Next.js 页面）→ `POST /api/game/action` 写操作 → 状态机更新 Supabase 中的对局 → `GET /api/game/stream?matchId=` SSE 长连接轮询数据库 diff 推送新消息 → AI 回复由服务端在 action 后异步生成再落库。

---

## 二、3 个可借鉴的开源项目

### 1. oil-oil/wolfcha —— AI 狼人杀（最值得抄，栈完全一致）
- URL: https://github.com/oil-oil/wolfcha （线上: wolf-cha.com，2026-09 仍在活跃更新）
- **技术栈**：Next.js 16 App Router + TypeScript + Tailwind 4 + Radix UI + Jotai + Framer Motion + Supabase + 独立 realtime 服务器（`server/` 目录）+ 独立共享逻辑（`.shared/`）
- **可直接抄的点**：
  1. **双层角色扮演 prompt 设计**（README 明确描述）：Layer 1 = AI 扮演有独特性格背景的"虚拟玩家"，Layer 2 = 该玩家再套狼人杀角色发言/诈唬/推理。映射到图灵盲盒即「人设层（个性/口头禅/打字习惯）× 目标层（你要装 AI / 装 human）」，两层解耦可随意组合，是伪装多样性的关键。
  2. **阶段式游戏状态机**：`src/game/phases/` 下每个游戏阶段一个类文件（`DaySpeechPhase.ts`、`NightPhase.ts`、`VotePhase.ts`、`BadgePhase.ts`），配 `src/game/core/` 公共逻辑。图灵盲盒可对应：`MatchmakingPhase → ChatPhase（N 轮） → GuessPhase（互猜身份） → BetPhase（下注结算） → ResultPhase`，每个 Phase 一个文件 + 统一接口，含断线恢复测试（`vote-resume.test.ts` 值得参考）。
  3. **上下文回归测试**：`context-regressions.test.ts` / `factual-context.test.ts` 保证喂给 LLM 的游戏事实（谁死了、谁投了谁）不出错——我们的 Agent 记忆系统可直接借鉴这种"事实上下文"单测。

### 2. alxgpt/bot-or-not —— 人类混池找 AI（玩法最像）
- URL: https://github.com/alxgpt/bot-or-not
- **技术栈**：Python FastAPI + WebSocket + 静态前端；核心文件 `ai_bot.py`（LLM bot）、`game_logic.py`（游戏流程）、`gamedesign.md`（玩法设计文档）
- **可直接抄的点**：
  1. **人机混池 + 投票找 AI** 的完整流程与积分设计（`gamedesign.md` 700 行玩法文档可直接当产品需求模板）。
  2. **AI bot 伪装 prompt**：`ai_bot.py` 中给 bot 设定"扮演人类、避免过于结构化的回复、允许打错字/口语化"的 persona 提示词写法，正是「AI 装人」方向的现成素材。
  3. 房间生命周期管理（`main.py` + `game_logic.py`）：加入/开局/轮转/结算的状态推进逻辑可移植为 TS 版状态机。

### 3. rd-serendipity/reverse-turing-test-game —— 反向图灵测试（人类装 AI）
- URL: https://github.com/rd-serendipity/reverse-turing-test-game
- **技术栈**：Python，兼容 Groq/OpenAI 等多供应商
- **可直接抄的点**：
  1. **双向身份玩法**："人类试图混入 AI，AI 猎捕人类"——与图灵盲盒「人类装 AI / AI 装人」双角色设定同构，其角色 prompt（人类侧伪装指令 vs AI 侧鉴别指令）和投票/淘汰流程可参考。
  2. **多 LLM 供应商适配层**：通过统一接口切换 Groq/OpenAI，是我们做「LLM API 不可用降级」的参照。
- 备选观察：`gianlucatruda/aimong-us`（AI 反向测人类）、`kiliankoe/gptdash`（最早的 reverse turing test）可作灵感来源。

---

## 三、Next.js App Router 实时方案

### 三方案对比（Vercel serverless 前提）

| 方案 | 可行性 | 延迟 | 2 天成本 | 结论 |
|---|---|---|---|---|
| 客户端轮询 | ✅ 最稳 | 1-3s | 半小时 | **降级保底方案** |
| **SSE（Route Handler + ReadableStream）** | ✅ 官方支持，流式响应在 serverless 可用 | ~1s（内部每秒拉一次 DB/Redis diff） | 2-3 小时 | **推荐主方案** |
| socket.io / WebSocket | ❌ 需常驻长连接服务器，Vercel serverless 不支持；除非另部署 Railway/Fly 节点或换 Supabase Realtime | 最低 | 高 | 不采用 |

SSE 相比轮询的优势：复用一条 HTTP 连接、自动重连（EventSource 内建）、天然适合"对局事件流"语义；实现上仍由服务端每 ~1s 轮询状态存储再推送，规避了 serverless 实例间内存不共享的问题。

### 最小代码骨架（依据 Next.js 官方文档/测试用例确认的写法）

**服务端 `app/api/game/stream/route.ts`：**

```typescript
// app/api/game/stream/route.ts
export const dynamic = 'force-dynamic'   // 禁用缓存，SSE 必须
export const maxDuration = 60            // Vercel 上显式声明（Hobby 上限见风险清单）

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const matchId = searchParams.get('matchId')
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let cursor = 0
      try {
        while (true) {
          // 1. 每秒从 Supabase/Upstash 拉取该对局的新事件（消息/阶段变更）
          const events = await fetchNewEvents(matchId, cursor)
          for (const e of events) {
            cursor = Math.max(cursor, e.seq)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`))
          }
          // 2. 心跳注释行，防止代理超时断连
          controller.enqueue(encoder.encode(`: ping\n\n`))
          await new Promise((r) => setTimeout(r, 1000))
          // 3. 客户端断开时退出（req.signal 由框架联动）
          if (req.signal.aborted) break
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', // 官方文档建议：确保分块即时到达
      Connection: 'keep-alive',
    },
  })
}
```

**客户端：**

```typescript
// components/ChatRoom.tsx
useEffect(() => {
  const es = new EventSource(`/api/game/stream?matchId=${matchId}`)
  es.onmessage = (ev) => {
    const event = JSON.parse(ev.data)
    if (event.type === 'message') appendMessage(event.payload)
    if (event.type === 'phase')  setPhase(event.payload) // guess/bet/result
  }
  es.onerror = () => { /* EventSource 会自动重连；可在此计数，>5 次切换轮询降级 */ }
  return () => es.close()
}, [matchId])
```

**写操作**走普通 `POST /api/game/action`（发消息、下注、猜身份），服务端更新状态库并触发 AI 生成，AI 回复落库后由 SSE 通道推给双方。

---

## 四、UI 方案结论

- **定稿：shadcn/ui（提供 Dialog/Toast/Card/ScrollArea 等交互件）+ Tailwind 手写聊天气泡**。理由：`npx shadcn init` + 添加组件约 10 分钟；下注面板、结算弹窗这类带无障碍语义的组件自写易漏细节；而聊天气泡（左右对齐、头像、打字中动画）手写 30 行足够且更有游戏感。wolfcha 的 Radix + Tailwind 组合印证此路径可行。
- **聊天界面开源参考：vercel/ai-chatbot**（https://github.com/vercel/ai-chatbot ）——Next.js App Router + Tailwind + AI SDK 流式渲染的官方级聊天 UI，消息气泡、流式打字、自动滚动均可直接搬；骨架可 `npx create-next-app` + 抄其 `chat.tsx` 组件结构。

---

## 五、风险清单

### 部署风险
1. **Vercel serverless 函数时长上限**：Hobby 计划 `maxDuration` 默认 10s、可配至 60s（Pro 更长）。SSE 长连接会被掐断 → 缓解：`export const maxDuration = 60` + 客户端 EventSource 自动重连（带 `Last-Event-ID`/cursor 续传）+ 轮询降级开关。
2. **实例间内存不共享**：两个玩家请求可能落在不同 lambda → 对局状态**绝不放服务端内存**，一律以 Supabase/Upstash 为唯一事实源（wolfcha 的 server/ 独立进程方案在纯 Vercel 上不可照搬，Demo 用 DB 轮询式 SSE 替代）。
3. **代理/CDN 缓冲 SSE**：务必带 `Cache-Control: no-store`、`X-Content-Type-Options: nosniff`，并每 ~15s 发心跳注释行。
4. **公网 Demo 被滥用刷 LLM 费用**：加简单限流（Upstash rate limit）+ 对局接口签名。

### LLM API 不可用 / 慢的降级方案
1. **多供应商链**：主用 DeepSeek/Qwen（便宜快），失败自动切备用；AI SDK 或手写 try/catch 链。
2. **超时兜底**：AI 回复超过 ~8s 未返回，先推「对方正在输入…」；超过 15s 落库一条**预置人设语料池**的应答（每个 persona 预生成 20-30 条，按对话轮次挑最相关的），对局不中断。
3. **完全不可用**：降级为「纯人类 1v1 + 规则机器人」模式（脚本化回复），保证演示不断；下注/猜身份玩法不受影响。
4. **判分一致性**：互猜身份的胜负由**确定性游戏逻辑**判定（双方身份在开局即由服务端密封），LLM 只生成内容不裁决结果——LLM 挂了不影响积分系统。

### 玩法/工程风险
5. **AI 装人太假 / 人装 AI 太真**：prompt 上做「人味注入」（口语化、错字率、短句、表情习惯，参考 bot-or-not 的 ai_bot.py）；并加防作弊约束：装 AI 的人类不得复制粘贴 LLM 输出全无破绽，靠轮次限时（每轮 30s）压缩思考时间。
6. **知乎 API 密钥安全**：Access Secret 只存服务端环境变量，所有知乎接口（search/hot/answer）经 Route Handler 服务端代理，前端仅见脱敏结果。
7. **2 天工期切割建议**：D1 上午搭骨架（create-next-app + shadcn + Supabase 表）→ D1 下午核心对局（发消息/状态机/AI persona prompt）→ D1 晚 SSE + 猜身份/下注 → D2 上午积分结算 + 降级链路 → D2 下午 Vercel 部署 + 知乎素材接入 + 真人压测。

---

## 附：调研来源
- wolfcha 架构与双层 prompt：https://github.com/oil-oil/wolfcha （README.en.md、src/game/phases/ 目录结构）
- bot-or-not 混池玩法与 bot prompt：https://github.com/alxgpt/bot-or-not （ai_bot.py、gamedesign.md）
- 反向图灵测试：https://github.com/rd-serendipity/reverse-turing-test-game
- Next.js SSE 官方写法：vercel/next.js 官方文档 streaming 指南与 route handler 测试用例（经 Context7 检索确认）
- 聊天 UI 参考：https://github.com/vercel/ai-chatbot
