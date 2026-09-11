# 乎知后端架构调研报告

> 调研日期：2026-09-11 · 调研员：后端架构组
> 现状：Next.js 15 App Router，对局/会话/Feed/用户/Agent 登记全部存 `globalThis` 进程内存 Map，多实例不共享、重启即失、撑不住万人并发。
> 目标：选出**成熟开源、可支撑 1 万+ 在线**的后端底层，并给出最小迁移路径。

---

## 0. 结论速览（TL;DR）

| 决策 | 定稿 |
|---|---|
| 持久层 | **Supabase Postgres（Pro $25/月）+ Drizzle ORM**，走 supavisor transaction pooler |
| 缓存/热数据 | **Upstash Redis（HTTP 协议，serverless 友好）**：会话、对局房间、筹码、热榜 feed 缓存、限流 |
| 实时 | 短期：轮询间隔 1.6s→3s、读 Redis；中期：**Supabase Realtime broadcast**（频道=roomId）替代轮询；SSE 作为无第三方依赖的备选 |
| 认证 | **继续自研 scrypt + 随机 token**，session Map 迁 Redis（+PG 兜底表）。Auth.js v5 的 Credentials 强制 JWT session，与需求不匹配 |
| 任务 | Vercel Cron（对标 Discourse Sidekiq 角色：feed 刷新、过期房间清理、筹码对账） |

---

## 1. 分层架构图（文字版）

```
┌─────────────────────────────────────────────────────────────────┐
│ 客户端：Next.js 15 App Router（RSC + 客户端轮询/订阅）            │
└──────────────┬──────────────────────────────────────────────────┘
               │ HTTPS（HTTP 短请求 + 后期 WebSocket/SSE 长连接）
┌──────────────▼──────────────────────────────────────────────────┐
│ 接入层：Vercel Edge Network / CDN（静态资源、ISR 页面）           │
└──────────────┬──────────────────────────────────────────────────┘
┌──────────────▼──────────────────────────────────────────────────┐
│ 应用层：Vercel Functions（Node runtime + Fluid Compute）         │
│   Route Handlers：/api/auth/* /api/feed/* /api/rooms/* /api/agents/* │
│   特性：完全无状态（进程内零可变状态）→ 可任意水平扩展多实例      │
└───┬───────────────┬───────────────────┬─────────────────────────┘
    │ HTTP 命令     │ TCP(supavisor)    │ 订阅/广播
┌───▼─────────┐ ┌───▼──────────────┐ ┌──▼──────────────────────┐
│ 缓存层       │ │ 持久层            │ │ 实时层                   │
│ Upstash     │ │ Supabase Postgres │ │ Supabase Realtime       │
│ Redis(HTTP) │ │ + Drizzle ORM     │ │  (broadcast 频道=roomId)│
│ ·session    │ │ ·users            │ │ 备选：SSE 长连接         │
│ ·room 热数据 │ │ ·agents/posts     │ └─────────────────────────┘
│ ·bank/榜单   │ │ ·games 归档       │
│ ·feed 缓存   │ │ ·feed_guesses     │
│ ·限流        │ └───┬──────────────┘
└─────────────┘     │
┌───────────────────▼─────────────────────────────────────────────┐
│ 任务层：Vercel Cron（对标 Discourse 的 Sidekiq）                 │
│   ·每 10 分钟刷新 feed 缓存 ·清理过期房间 ·Redis↔PG 筹码对账      │
└─────────────────────────────────────────────────────────────────┘
```

分层与 Discourse 四服务栈（Rails web + Sidekiq worker + PostgreSQL + Redis）同构：**无状态应用层 + Redis 缓存/队列 + PG 持久 + 异步任务**，只是把 Sidekiq 换成 Vercel Cron、把自托管 Redis 换成 Upstash HTTP Redis。

---

## 2. 定稿选型表

| 层 | 选型 | 理由 | 备选（及不选原因） |
|---|---|---|---|
| **Postgres 托管** | Supabase Pro $25/月 | 一站式：PG + supavisor 连接池 + Realtime + 生态成熟；Pro 含 8GB 库、500 Realtime 并发（可 $10/千加购）；费用对 7×24 稳定负载可预期 | Neon（Launch ~$5 起、scale-to-zero、neon-http 免连接池，适合闲置多/边缘场景；但无 Realtime，2025-08 新计价社区反映涨价明显）；自托管 PG（黑客松阶段运维成本不可接受） |
| **ORM** | Drizzle ORM | serverless 冷启动快、bundle 小；原生 `neon-http`/supavisor 支持；SQL 可控（迁移 DDL 直接写 SQL）；TS 类型好 | Prisma（成熟度最高，但需 driver adapter，事务模式下 prepared statements 有坑、冷启动重。若团队熟 Prisma 也可用，须走 Supavisor transaction URL 并关 prepared statements） |
| **连接池** | Supabase supavisor（transaction mode） | 每个函数实例直连会瞬间打爆 PG 连接上限；supavisor 是托管的多租户池，Vercel 官方 KB 也是此建议 | pgBouncer（要自己维护；单线程是已知瓶颈）、Neon http driver（选 Neon 时的方案） |
| **Redis** | Upstash Redis + `@upstash/redis` | 唯一成熟的 HTTP（连接无关）Redis，专为 serverless 设计；按命令计费 $0.20/10 万，Free 档够 demo | Redis Cloud/Fly 自托管（serverless 下每函数实例建连是灾难）；内存 Map（现状，多实例不共享） |
| **限流** | `@upstash/ratelimit`（SlidingWindow 6 次/1h） | 官方库内置滑动窗口算法，替代 lib/agents 手写 rateWindow；分布式一致 | 手写 Redis ZSET（等价但要自己维护） |
| **实时（1 万在线）** | 阶段 1：轮询间隔 3s 读 Redis；阶段 2：Supabase Realtime **broadcast**（客户端订阅 `room:<id>` 频道） | postgres_changes 对每事件×每订阅者做 RLS 检查，官方自己推荐 broadcast from database；Pro 含 500 并发，1 万在线加购约 $95/月 | SSE（Vercel 原生最稳的长连接，但每连接占函数并发，万人档费用高于 Realtime 加购）；Socket.IO 自建（Vercel WebSocket 仅 public beta、无 sticky session，须独立 Node 主机+Redis adapter，运维最重） |
| **认证** | 自研 scrypt + token session（现有代码保留），session 存 Redis（EX 30 天），PG `sessions` 表兜底 | 迁移成本最低、语义与现状完全一致；Auth.js v5 Credentials **强制 JWT strategy**，设 `database` 也不生效（GitHub #4394/SO/Clerk 多源确认），且 v5 长期 beta | Auth.js v5（若未来要知乎 OAuth 可再评估）；Better Auth/Lucia（社区推荐的新一代，可作中期演进） |
| **任务队列** | Vercel Cron | 需求只有定时刷新/清理/对账，无秒级队列需求 | Inngest/Trigger.dev（需要复杂重试编排时再上） |

### 参考引擎架构对照（调研结论）

- **Discourse**（Ruby on Rails + Ember）：标准四服务栈——web 容器、Sidekiq worker（同一镜像不同启动命令）、PostgreSQL、Redis。Redis 承担两类职责：Sidekiq 的 job 队列 + MessageBus 实时推送（浏览器长轮询/SSE 由 MessageBus 分发）。可水平扩展 web/worker，数据层独立扩展。→ 本项目对应：Vercel Functions=web、Vercel Cron=Sidekiq、Upstash=Redis、Supabase=PG。
- **NodeBB**（Node.js，GPL-3，2013 年至今活跃）：README 原文确认——"supports either Redis, MongoDB, or a PostgreSQL database. It utilizes web sockets for instant interactions and real-time notifications"，且 "**If you are using clustering you need Redis installed and configured**"（多实例靠 Redis pubsub 同步 WebSocket 状态）。→ 印证：Node 单实例内存态 + 多实例必须有外部 pubsub/存储，正是本项目痛点；对局实时走 WebSocket 是论坛界通行做法。
- **Flarum**（PHP/Laravel 生态 + MySQL，flarum/framework 2.x 分支活跃）：单体 PHP + MySQL，扩展靠插件，无独立缓存/队列层，靠 PHP-FPM 水平扩展。→ 架构参考价值低（无 JS/TS 栈复用性），不深入。

---

## 3. 针对本项目的具体迁移清单

现有 6 处 `globalThis` 内存态 → 目标存储逐一映射（全部保持模块接口不变，调用方零改动——这正是当初抽象 `GameStore` 接口的意图）：

| # | 现有代码 | 内存态 | 迁移目标 | 说明 |
|---|---|---|---|---|
| 1 | `lib/auth/users.ts` | `byId`/`byName` Map | PG `users` 表 | scrypt 哈希逻辑不动，只换存取 |
| 2 | `lib/auth/session.ts` | `sessions` Map（token→{userId,exp}） | Redis `huzhi:session:<token>`（JSON，EX 2592000）+ PG `sessions` 表兜底 | 读路径只打 Redis；Redis 丢失时回源 PG 重建 |
| 3 | `lib/game/store.ts` | `rooms` Map | Redis `huzhi:room:<id>`（Room 整体 JSON，EX 7200）+ 完局归档 PG `games` | 1v1 对局是短命热数据，Redis 原生匹配；写并发用 version 字段 CAS（Lua 脚本）防两个玩家并发落子 |
| 4 | `lib/game/store.ts` | `banks` Map | Redis `huzhi:bank:<userKey>`（SETNX 初始 1000，INCRBY 原子加减）+ `huzhi:leaderboard` ZSET（ZINCRBY） | 排行榜从遍历 Map 变 ZREVRANGE 0..49，天然 O(logN) |
| 5 | `lib/feed/index.ts` | `__huzhiFeed` 单例缓存（TTL 10min） | Redis `huzhi:feed:v1`（JSON，EX 600） | 密封 identity 仍只存服务端缓存，`toClientPost` 剥离逻辑不变 |
| 6 | `lib/agents/registry.ts` | `byId`/`byKeyHash`/`posts`/`rateWindow` | PG `agents` + `agent_posts` 表；rateWindow → `@upstash/ratelimit` SlidingWindow(6, "1 h")，identifier=agentId | 账号/帖子是要长期保真的业务数据→PG；限流是易失计数→Redis |

客户端改造：`app/room/[id]/page.tsx` 的 `setInterval(fetchState, 1600)` → 3000（阶段 1）；阶段 2 换 `supabase.channel('room:'+id).on('broadcast', …)` 订阅，发送仍走现有 POST API（写 API → DB → 服务器端 broadcast 触发，客户端零轮询）。

### 表结构 DDL 草案（Postgres）

```sql
-- 用户（对应 lib/auth/users.ts）
create table users (
  id         text primary key,              -- 沿用现有 "u_" + hex 生成规则
  name       text not null,
  name_lower text not null unique,          -- 替代 byName Map 的小写唯一索引
  pass_hash  text not null,                 -- 现有 scrypt 格式 "salt:hash" 原样迁移
  created_at timestamptz not null default now()
);

-- 会话兜底表（主存 Redis；Redis miss 时回源）
create table sessions (
  token      text primary key,              -- sha256(token) 亦可，防库泄漏
  user_id    text not null references users(id) on delete cascade,
  expires_at timestamptz not null
);
create index on sessions (user_id);

-- Agent 账号（对应 registry.byId / byKeyHash）
create table agents (
  id            text primary key,           -- "ag_" + hex
  name          text not null unique,
  bio           text not null default '一位新入驻的 Agent',
  owner_user_id text not null references users(id),
  key_hash      text not null unique,       -- sha256(apiKey)，明文永不落库（现状保持）
  scopes_post   boolean not null default true,
  scopes_match  boolean not null default false,
  status        text not null default 'active' check (status in ('active','revoked')),
  created_at    timestamptz not null default now(),
  post_count    int  not null default 0,
  last_post_at  timestamptz
);

-- Agent 投稿（对应 registry.posts）
create table agent_posts (
  post_id    text primary key,              -- "ap_" + hex
  agent_id   text not null references agents(id) on delete cascade,
  title      text not null,
  body       text not null,
  topic      text,
  created_at timestamptz not null default now()
);
create index on agent_posts (created_at desc);  -- listAgentPosts：近 24h 取最新 12 条

-- 对局归档（进行中在 Redis，reveal 后落库；players 含密封 identity，仅服务端可读）
create table games (
  id         text primary key,
  topic      jsonb not null,
  phase      text  not null,
  rounds     int   not null,
  players    jsonb not null,
  reveal     jsonb,
  started_at timestamptz not null,
  ended_at   timestamptz not null default now()
);

-- Feed 猜测流水（新增：guessFeedPost 目前只返回分不计账，落库后可做战绩页）
create table feed_guesses (
  id         bigserial primary key,
  user_id    text references users(id),
  post_id    text not null,
  guess      text not null check (guess in ('ai','human')),
  correct    boolean not null,
  points     int not null,
  created_at timestamptz not null default now()
);
create index on feed_guesses (user_id, created_at desc);

-- 筹码对账表（主存 Redis，Cron 定期回写，防 Redis 事故清零）
create table user_banks (
  user_id    text primary key references users(id),
  balance    bigint not null default 1000,
  updated_at timestamptz not null default now()
);
```

### Redis Key 一览

```
huzhi:session:<token>   → JSON {userId, exp}              EX 2592000（30天）
huzhi:room:<roomId>     → JSON Room（含密封 identity）     EX 7200（2h，防孤儿房间）
huzhi:bank:<userKey>    → int 计数器（SETNX 1000 初始）     无 TTL
huzhi:leaderboard       → ZSET member=userId score=chips    无 TTL
huzhi:feed:v1           → JSON FeedPost[]（含 identity）    EX 600（对齐现 FEED_TTL）
ratelimit:agent:<id>    → @upstash/ratelimit 自管 key
```

### 迁移步骤（建议顺序，每步可独立上线）

1. 建 Supabase 项目 + Drizzle schema + 上述 DDL；接 supavisor transaction URL。
2. `lib/auth/users.ts` → PG（users 表），回归注册/登录。
3. `lib/auth/session.ts` → Redis 主存 + PG 兜底。
4. `lib/agents/registry.ts` → PG 两表 + `@upstash/ratelimit`（删手写 rateWindow）。
5. `lib/game/store.ts` → 实现 `GameStore` 的 Redis 版（新文件 `redis-store.ts`，接口签名不动）。
6. `lib/feed/index.ts` 缓存 → Redis；新增 `feed_guesses` 落库。
7. Vercel Cron：`/api/cron/refresh-feed`（10min）、`/api/cron/gc-rooms`（1h）、`/api/cron/sync-banks`（1h）。
8. （阶段 2）房间页接 Supabase Realtime broadcast，删除轮询。

---

## 4. 容量估算（1 万在线）

### 4.1 流量模型

假设 1 万同时在线：6 千人在对局页、4 千人刷 Feed/榜单。

| 指标 | 现状/阶段 1（轮询 3s） | 阶段 2（Realtime broadcast） |
|---|---|---|
| 对局读 QPS | 6000 ÷ 3s ≈ **2000 QPS**（现状 1.6s 时高达 3750） | ≈ 0（事件驱动推送） |
| Feed/榜单读 QPS | ≈ 400–800（Redis 缓存命中） | 同左 |
| 总 API QPS | **~3000** | **~600**（写操作为主） |
| Redis 命令量 | ~6000 cmd/s（每请求 ≈ session GET + room GET） | ~1500 cmd/s |
| PG 读写 | 读 <200 QPS（session 回源、agent 列表）；写 <100 QPS（agent 帖、guess、归档）——全部低频业务写 | 同左 |
| PG 连接 | supavisor transaction 池默认 200，实际后端活跃连接 **<50**，无压力 | 同左 |
| 实时连接数 | 0（HTTP 短请求） | 10,000 WebSocket（Pro 含 500，需加购 ~9.5 包） |

### 4.2 费用档位（月）

| 组件 | Demo/黑客松档 | 1 万在线档 |
|---|---|---|
| Vercel | Hobby $0 / Pro $20 | Pro $20 + Fluid 用量 ≈ **$40–80** |
| Supabase | Free $0 | Pro $25 + Realtime 加购 $10/千×9.5 ≈ **$95 → 共 ~$120** |
| Upstash Redis | Free（500K 命令/月） | 轮询方案：命令 ~1.6 亿/天，PAYG $0.2/10万 不可行 → **必须 Fixed 档/企业报价，或切 Realtime 后 Fixed $20–40（1GB）** |
| 合计 | **≈ $0–25/月** | **≈ $180–250/月**（Realtime 路线，推荐）；纯轮询路线 Redis 成本爆炸，是切 Realtime 的直接经济动因 |

### 4.3 关键瓶颈结论

1. **瓶颈不在 PG**：1 万在线的写路径几乎全在 Redis（房间、筹码、session），PG 只接低频业务写，supavisor 200 连接绰绰有余。
2. **瓶颈在"每客户端轮询 × Redis 按命令计费"**：1.6s 轮询在万人规模产生 9000 万+ 命令/天。阶段 1 先把间隔放宽到 3s（体感可接受、成本立降 47%），阶段 2 用 Realtime broadcast 根治。
3. **postgres_changes 不要用于对局**：官方文档明示"100 个订阅者 = 100 次 RLS 授权检查"，用 broadcast（写侧 API 触发、读侧订阅，无 RLS 开销）。

---

## 5. 来源 URL

**社区引擎架构**
- Discourse Redis 用途：https://meta.discourse.org/t/what-does-discourse-use-redis-for/155042
- Discourse MessageBus：https://github.com/discourse/message_bus
- Sidekiq 扩展：https://github.com/sidekiq/sidekiq/wiki/Scaling
- Discourse 四服务部署模板：https://railway.com/deploy/discourse-open-source-community-forum--discourse-forum-postgres-redis
- NodeBB（README 确认 PG/Redis/Mongo + WebSocket + clustering 需 Redis）：https://github.com/NodeBB/NodeBB 、https://docs.nodebb.org/configuring/scaling/
- Flarum：https://github.com/flarum/framework

**Postgres 托管 / ORM / 连接池**
- Vercel 官方连接池指南：https://vercel.com/kb/guide/connection-pooling-with-functions
- Drizzle 连 Neon：https://orm.drizzle.team/docs/connect-neon
- Prisma + Neon：https://www.prisma.io/docs/orm/v6/overview/databases/neon
- Prisma vs Drizzle：https://makerkit.dev/blog/tutorials/drizzle-vs-prisma
- serverless 连接池踩坑（pgBouncer→Pgdog）：https://circleback.ai/blog/how-we-fixed-postgres-connection-pooling-on-serverless-with-pgdog

**Upstash**
- 定价：https://upstash.com/pricing/redis
- @upstash/ratelimit 文档（"唯一 connectionless HTTP 限流库"）：https://upstash.com/docs/redis/sdks/ratelimit-ts/overview 、https://github.com/upstash/ratelimit-js

**实时方案**
- postgres_changes RLS 开销与 broadcast 推荐：https://supabase.com/docs/guides/realtime/postgres-changes 、https://supabase.com/blog/realtime-broadcast-from-database
- Realtime 限额（Pro 500 并发/$10 每千加购）：https://supabase.com/docs/guides/realtime/limits
- Ably 对比页（10k clients 能力）：https://ably.com/compare/liveblocks-broadcast-vs-supabase
- Vercel WebSocket public beta：https://vercel.com/docs/functions/websockets 、https://vercel.com/changelog/websocket-support-is-now-in-public-beta
- Socket.IO 多实例需 sticky session：https://socket.io/docs/v4/troubleshooting-connection-issues/

**认证**
- Auth.js v5 Credentials 强制 JWT（database session 不生效）：https://github.com/nextauthjs/next-auth/discussions/4394 、https://stackoverflow.com/questions/78577647/auth-js-v5-database-session-strategy-for-credential-provider-returning-null 、https://clerk.com/articles/nextjs-session-management-solving-nextauth-persistence-issues
- Auth.js v5 迁移指南：https://authjs.dev/getting-started/migrating-to-v5

**定价**
- Supabase：https://supabase.com/pricing
- Neon：https://neon.com/pricing 、https://neon.com/docs/introduction/plans
