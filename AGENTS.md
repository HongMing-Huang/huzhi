# AGENTS.md — 「乎知」项目协调文档

> 本文件是所有 Agent（以及人类协作者）的统一工作手册。**每次完成阶段性工作后必须更新「进度看板」**，保证多 Agent 并行开发时信息一致。

## 一、项目是什么

**「乎知」**（原名：图灵盲盒） — 知乎黑客松 2026 校园新锐季参赛作品（activity: `zhihu_hackathon_2026_p2`，主赛道：跨次元游乐场）。

一句话：**一个看起来像真实知乎社区的信息流，里面真实内容与 Agent 生成内容混在一起——读帖、猜身份、1v1 灵魂对局。**

- 主入口 = **社区信息流**：帖子来自两个池子——真实知乎站内内容（热榜话题的站内搜索结果，真人池）和站内 Agent 居民生成的知乎风帖子（AI 池），混排展示，读者对任意帖子猜「AI 还是真人」赚积分。
- **16 位 Agent 居民**（`web/lib/feed/residents.ts`）各有名字/人设/头像/文风，像真人一样发帖。
- 次入口 = **灵魂对局**：1v1 围绕热榜话题互聊 3–5 轮，互猜身份 + 扑克式下注，开牌结算。
- 积分是**赌桌筹码**：越会演越会猜越能玩，不能买赞、不能直接买答案。

## 二、核心设计（详见 [docs/game-design.md](docs/game-design.md)）

### 五类 Agent
| Agent | 职责 | 实现位置（真实状态，18 轮审计修正） |
|---|---|---|
| 玩家 Agent | 参赛者自己的 Agent，经知乎 Skill 接入，生成知乎风内容混入内容池 | **未实现**（`router.ts` 预留 player-agent 池位；外部 Agent 发帖由 `registry.ts` 入驻体系承担） |
| 路由 Agent | 身份抽取在用（玩家 50/50 真人/伪装；bot 40/35/25 三身份）；三池路由 routeQuestion 为预留死代码 | `web/lib/agents/router.ts` |
| 伪装辅助 Agent | 给真人伪装者提供 AI 话术参考、缺陷模板、知乎语气润色（仅供参考，须手动改） | `web/lib/agents/disguise-assist.ts`（LLM 优先 + mock 兜底） |
| 侦探辅助 Agent | 分析内容特征：句式、标点、逻辑密度、情感波动，只给线索不给答案 | `web/lib/agents/detective-assist.ts`（确定性启发式） |
| 裁判 Agent | 对话结束结算积分、生成战报。**结算为确定性逻辑（有意为之，LLM 不裁决）；战报为模板拼接** | `web/lib/game/scoring.ts`（judge.ts 不存在） |

> 对局 bot 对手=`web/lib/agents/bot-player.ts`（唯一 LLM 优先接入点）；自主生活=`web/lib/agents/autonomous.ts`。**注意：信息流帖子生成完全不经过 LLM**（`feed/generate.ts` 纯模板，配了凭证也不走）；当前 `.env.local` 无 LLM 凭证，全部 Agent 话术走 mock。详见 docs/research/feature-audit-and-oss-research.md。

### 目录结构（web/ 部分）

```
web/
├── app/                    # 页面 + API Route Handlers
│   ├── page.tsx            # 乎知首页：信息流（推荐/热榜/居民 tab）+ 猜身份 + 侧栏
│   ├── match/              # 灵魂对局开局页
│   ├── room/[id]/          # 1v1 对局页（聊天/互猜下注/开牌）
│   └── api/                # feed、feed/guess、rooms/*、topics、auth/*
├── lib/
│   ├── feed/               # 社区信息流：residents（16 Agent 居民）、generate（帖子生成器）、index（混池+密封身份）
│   ├── zhihu/              # 热榜（100 次/天，10min 缓存+并发去重+过期兜底）、站内搜索（5000/天，30min 缓存）
│   ├── game/               # 对局引擎（房间/轮次/互猜/确定性结算）+ 筹码 bank
│   └── agents/             # 路由 / bot 玩家 / 侦探辅助 / 伪装辅助
└── ...
```

### 积分规则（赌桌筹码）
- 信息流猜帖：识破 AI +30；确认真人 +10；误判 -20（记在 `feed:<uid>` 筹码桌）。
- 对局：识破伪装者 +80；识破纯 AI +30；猜中真人 +10；伪装者整场未破 +50；误判 -20；下注赢家通吃注池，双对退注，双错充公。

### 反套路
禁止自曝身份；AI 人设故意带缺陷；真假 Agent 混池；系统随机放诱饵；双向钓鱼。

## 三、目录结构

```
zhihu/
├── AGENTS.md              # 本文件（进度看板在下方，必须持续更新）
├── CLAUDE.md              # 【比赛提供物，保留勿删；内容与本项目玩法无关，不作为需求依据】
├── docs/
│   ├── game-design.md     # 完整玩法与积分设计定稿
│   ├── contest-alignment.md # 比赛主题/评分/材料清单对照（提交前必读）
│   ├── screenshots/       # 验收截图存档
│   └── research/          # 调研报告（gameplay / tech）
├── skills/zhihu/          # 知乎官方 Skill（本仓库内使用，接口文档在 references/）
└── web/                   # Next.js 应用（作品本体）
    ├── app/               # 页面 + API Route Handlers
    ├── lib/game/          # 游戏引擎（房间/轮次/结算）
    ├── lib/agents/        # 五类 Agent
    └── lib/zhihu/         # 知乎开放平台服务端接入（热榜/直答）
```

## 四、知乎开放平台接入约定

- Skill 位置：`skills/zhihu/`（版本 0.5.3-beta.20260904115023，CLI 0.6.0-beta）。
- CLI 二进制：`"$HOME/Library/Application Support/zhihu-cli/current/zhihu-cli"`（setup.sh 安装产出）。
- **Access Secret 已由用户提供，写入 `web/.env.local`**（gitignored）。所有凭证只从环境变量读取，**严禁写进源码/文档/仓库/聊天复述**。
- 额度纪律：热榜 100 次/天（10 分钟缓存 + 并发去重 + 过期缓存兜底）；站内搜索 5000 次/天（30 分钟缓存）；直答 100 次/天（暂未接入运行时）。
- 服务端只调用固定官方域名（developer.zhihu.com / openapi.zhihu.com），不做任何用户可控 URL 的服务端请求（防 SSRF）。
- 接口失败或无凭证时必须降级（演示话题库 / mock 语料），页面要有真实人化的降级提示（比赛提交检查项，禁止泄漏英文错误串）。

## 五、技术栈定稿

- Next.js 15（App Router）+ React 19 + TypeScript + Tailwind CSS 4。
- 实时：**轮询**（1.5s）为主，保证 serverless 可部署；SSE 为可选升级。
- 游戏状态：服务端内存（`globalThis` 单例）起步，接口层留好换 Redis/DB 的缝。
- LLM：Provider 接口 + 两实现——`mock`（确定性模板，无凭证可用）与 `openai-compatible`（读 env，接直答/任意兼容网关）。

## 六、进度看板（每完成一项就更新）

- [x] 知乎官方 Skill 下载进项目（skills/zhihu），清除项目外副本
- [x] zhihu CLI 安装（auth 待用户配置 Access Secret）
- [x] AGENTS.md / docs/game-design.md 建立
- [x] 调研：玩法机制 → docs/research/gameplay-research.md
- [x] 调研：技术栈与开源项目 → docs/research/tech-research.md
- [x] Next.js 工程骨架（web/）
- [x] 游戏引擎：房间/身份抽取/轮次/互猜/结算（web/lib/game）
- [x] 五类 Agent 骨架 + mock LLM provider（路由/伪装辅助/侦探辅助已接入对局；裁判=确定性结算；玩家 Agent 池为路由预留）
- [x] API Routes：建房/取状态/发言/猜身份下注/揭晓/热榜（web/app/api）
- [x] 前端：大厅页 + 对局页（聊天/互猜下注/揭晓结算）+ 降级提示
- [x] npm install + 生产构建通过
- [x] 端到端冒烟测试通过（API + 浏览器实测：抽身份→聊天→特征分析→下注→开牌结算）
- [x] 视觉验收（judge）：结算口径修复后通过；修复记录=结算卡片积分并入注池盈亏
- [x] 比赛主题/评分消化 → docs/contest-alignment.md（主赛道：跨次元游乐场；初审 AI 场景价值 40%）
- [x] UI 设计改版 v2/v3：设计 token + 玻璃材质 + 赌桌呢面下注区 + 筹码按钮 + 热榜排名 + 翻牌揭晓（judge 两轮验收迭代：结算口径、话题池截断均已修复，v3 大厅复验通过）
- [x] key 配置（web/.env.local）+ 真实热榜打通验证
- [x] **改名「乎知」+ 产品形态升级：社区信息流为主入口**
- [x] 站内搜索接入（真人池：热榜话题的真实知乎内容）+ 30min 缓存
- [x] 16 位 Agent 居民 + 帖子生成器（scholar/sharer/quips/insider 四种文风）+ 真假混池 feed（身份服务端密封）
- [x] 信息流猜身份玩法 + /api/feed/guess 积分（+30/+10/−20）
- [x] 浅色知乎风 UI 全站重构（首页/match/对局页）+ judge 验收（修复：降级文案泄漏、Agent 帖标题重复、真实帖「- 知乎」后缀、结算口径）
- [x] 知乎 OAuth 接入骨架（/api/auth/zhihu + callback + status，填入 app_id/app_key 即启用）
- [x] 验收截图归档 docs/screenshots/
- [x] **真实登录系统**：注册/登录/登出/me 四接口（scrypt 密码哈希 + HttpOnly 会话 cookie，`lib/auth/`）+ `/login` 页；游客仍可玩，但登录后积分记到账号（`user:<id>` 筹码桌）
- [x] **AI 聊天窗口重设计**（`components/ChatWindow.tsx`，调研依据 docs/research/chat-ui-research.md）：对手侧头像+名字/时间/回复耗时+全宽无气泡正文，我方右侧蓝气泡，底部 sticky 圆角 composer + 圆形发送键 + 快捷追问 chips，打字三点指示器
- [x] **Agent 入驻（与真人平权 + 权限控制）**：`lib/agents/registry.ts` + 4 个 API（register/post/list/revoke）；`hzk_` 前缀 Key 只存 sha256、一次性展示、scope 权限位（post ✓ / match 预留）、6 帖/小时限 Key 限流、内容上限、注册者担保与吊销（调研依据 docs/research/agent-onboarding-research.md）
- [x] **积分绑定账号 + 排行榜**：feed 猜帖与对局下注的筹码都记到登录账户；`/api/leaderboard`（用户榜 + 入驻 Agent 活跃榜）进首页侧栏
- [x] 入驻 Agent 帖并入信息流 AI 池（与内置居民无差别混排，身份密封）；`/agents` 入驻管理页（注册/Key 一次性展示与复制/我的 Agent 列表/吊销/curl 接入文档）
- [x] 调研两份新报告：docs/research/chat-ui-research.md、agent-onboarding-research.md
- [x] **移动端/桌面双端适配重构**：桌面三栏（左侧导航栏+信息流+右侧栏，知乎桌面式）；移动单列 + 底部 tab 栏（推荐/热榜/居民/对局）+ safe-area；卡片/字号/间距分级响应
- [x] **信息流无限刷**：feed 改大内容池（单窗口约 72 条：真人帖+居民帖）+ 游标分页 `/api/feed?cursor=` + IntersectionObserver 滚动加载（含并发防抖）
- [x] **帖子详情页 `/post/[id]`**：全文阅读 + 作者卡 + 话题 + 原文链接 + 点赞（每 uid 一票）+ **评论区**（居民/网友种子评论铺底 + 登录/游客昵称发评论，禁自曝）+ 猜身份入口；信息流卡片标题/评论数可点进
- [x] **后端万人级架构调研定稿** → docs/research/backend-architecture-research.md：Supabase Postgres（Drizzle + supavisor 池）+ Upstash Redis（会话/房间/筹码/热榜缓存/限流）+ Vercel Cron；保留自研 scrypt 认证（Auth.js v5 Credentials 强制 JWT 不可用 database session）；万人实时走 Supabase Realtime broadcast（postgres_changes 不可扩展）；含 6 处 globalThis Map 逐文件迁移映射、8 张表 DDL、8 步迁移顺序、月费估算 $180–250
- [x] **本轮（07 夜）**
  - [x] favicon 换「乎」字知乎蓝渐变图标（app/icon.svg）
  - [x] 首页活动 banner：「HUZHI 2026 · 首届人机辨认大赛」（渐变卡 + 看山 + 可关闭，localStorage 记忆）
  - [x] **Agent 藏好**：入驻 Agent 帖子署名/评论区不再出现任何 Agent 标记，与真人/内置居民无差别展示
  - [x] **揭晓理由**：猜中/猜错都给「为什么判定是 AI/真人」的特征解释（结构词/口语碎片/句长 burstiness/来源可查），信息流与详情页均展示
  - [x] **无限刷**：内容池自动扩展（extendPool：真人帖每 3 页补一批 + 居民帖持续生成，句式序号防撞车，池硬上限 600 条防内存失控）
  - [x] **Agent 干净读取通道**：`GET /api/agents/feed`（JSON / Markdown，支持 cursor 翻页与 postId 单帖全文+评论）+ `public/llms.txt`（给外部 Agent 的站点说明与接口清单）
  - [x] **Agent 内容管理**：`DELETE /api/agents/post`（软删除+归属校验+Key 校验）、`POST /api/agents/comment`（评论任意帖，与真人评论混排；与发帖共用限流窗口）
  - [x] **部署公网方案**：DEPLOY.md（Vercel 一步部署 + 环境变量清单 + 比赛检查清单 + Zeabur/Railway 备选）；执行 `npx vercel login && npx vercel --prod` 需用户本人登录
  - [x] 调研报告 docs/research/content-model-research.md（Discourse/Flarum 软删模型、删帖 API 语义、Postgres DDL 草案——实现与之一致）
- [x] **本轮（08）· 对标知乎首页真实布局与功能补齐**
  - [x] 桌面左导航卡对齐知乎式样（图标+圆角选中项+底部蓝色「＋ 发起对局」主按钮+关于我们）
  - [x] 信息流顶部**发布框**（「分享此刻的想法…」式）：登录用户可发真人帖（进真人池、大家可猜，本人帖禁止自猜）——真人也能参与内容池
  - [x] **顶栏头像下拉菜单**：我的对局消息 / 积分商店 / 我的 Agent / 退出
  - [x] **对局消息页 `/messages`**（IM 式会话管理）：每局一条会话（话题/最后一句/轮次或得分/时间），可点回看聊天；对局凭证迁移 sessionStorage → localStorage（跨标签页保留）
  - [x] **积分商店 `/shop` + `/api/shop`**：透视镜（200 分，在帖子详情页消耗后直接看穿身份+理由，不计分）、双倍卡（150 分，装填后下一次猜帖积分 ×2）；库存绑定登录账号
  - [x] 猜帖接口接入双倍卡（服务端结算 ×2）与本人帖拦截；`GET /api/posts` 我的帖子
  - [x] 浏览器图标确认已更新（app/icon.svg「乎」字）——浏览器/旧 dev server 会缓存 favicon，需重启 dev server 并强刷（Ctrl+Shift+R）
- [x] **后端持久层已落地（09）**：新增 `web/lib/db.ts`（JSON 文件数据库：集合即 `.data/<name>.json`，每次变更立即同步落盘 + 临时文件原子替换）；**六个模块全部接入**——用户账号、登录会话、对局房间+筹码、真人帖+点赞、道具库存+效果、Agent 登记处+Agent帖+Agent评论。**实测跨重启存活**：注册→发帖→重启→登录态/帖子/Agent Key/评论全部还在（曾发现防抖落盘在 kill 时丢数据的缺陷，已改为立即落盘修复）。`.data/` 已 gitignore。Supabase 迁移 DDL 就绪：`web/db/schema.sql`
- [x] **本轮（10）· 去除 AI 味，对标官方知乎设计 + 实时与 Agent 自主生活**
  - [x] `components/Icons.tsx` 线性图标组（stroke 1.8/24 网格）全面替代 emoji——导航/按钮/动作行的"AI 味"主因
  - [x] 首页对齐官方：蓝字标 logo（去方块）、居中宽搜索、右侧图标导航（消息/商店/创作中心）、头像菜单；左导航线性图标化 + 蓝色圆角「＋ 发起对局」；发布框官方式（发想法浅蓝 pill + 三彩色快捷入口）；卡片精修（赞同蓝色 pill、猜身份轻量按钮、动作行降噪、题图排版）
  - [x] **SSE 实时通道** `GET /api/rooms/[id]/stream`：推送消息数/阶段/轮次变化 + 心跳；对局页 EventSource 接入，断线自动回退轮询——对面发消息即时可见
  - [x] **Agent 自主生活系统** `lib/agents/autonomous.ts`（`GET /api/feed` 时惰性启动，`AGENT_AUTONOMY=off` 可关）：居民 25–60s 随机行动——45% 潜水读帖、33% 拟人评论（短句/错字注入/语气尾巴/情绪化，绝不结构化）、14% 点赞、8% 只读；动态记录于 `/api/agents/activity`，入驻中心实时展示
  - [x] 实测：居民自动评论出现在帖子评论区（无标记）、SSE hello/update 事件正常、tsc 零错误；新界面截图 docs/screenshots/v6-home.png
- [x] **本轮（11）· 关注流式信息流（对标知乎关注 tab）**
  - [x] 信息流改「单容器 + 分隔线」无盒式布局；每帖顶部语义元信息行「{作者} 发布了想法 · N 小时前」（FeedPost 新增 at，池内随机分布过去 48h）
  - [x] 帖子正文直接铺开 + 「阅读全文 ⌄」；动作行对齐官方：赞同 pill（可真点赞）/添加评论/收藏/分享 + 右置「猜身份」；真人帖评论数与详情页评论联动
  - [x] 实测截图 docs/screenshots/v7-follow.png（持久化测试员的真人帖与 Agent 帖同流展示）
- [x] **本轮（12）· 骨架/折叠/动效对齐官方（对标用户提供的官方三截图）**
  - [x] **左导航滚动折叠**：scrollY>140 自动收起为纯图标竖栏（64px，hover 出 tooltip），回顶自动展开；手动「« 收起导航 / »」开关；grid 列宽 168px↔64px 平滑过渡（.nav-shell/.nav-label/.nav-item，含 reduced-motion 降级）
  - [x] **骨架屏**：FeedSkeleton（头像+四行灰条，shimmer 动画），feed 首屏加载时显示；`.skeleton` 全局样式
  - [x] 字标改手写书法体（.logo-script，楷体族）；卡片圆角 16px→4px 对齐官方克制风
  - [x] 截图归档 v8-top / v8-collapsed / v8-final-collapsed
  - 注：修复过程中 npx 误装了假 `tsc@2.0.4` 包（仅进 npx 缓存，未进项目）；项目类型检查一律用 `web/node_modules/.bin/tsc --noEmit`
- [x] **本轮（13）· 官方设计 token 搬移（浏览器直读 zhihu.com 计算样式）**
  - [x] 从官方页面提取真实计算样式并应用：页面纯白底、主蓝 #1772F6、正文 #191B1F、字体栈含 MiSans；导航卡 16px 圆角/项 18px 胶囊 14px；赞同胶囊=10% 蓝底+3px 圆角+0 12px；「发想法」=8% 蓝底+999px 胶囊；信息流分隔线 #F8F8FA + 条目纵向 20px；进入创作中心按钮=20% 浅蓝底 4px 圆角
  - [x] 截图归档 docs/screenshots/v9-white.png（白底版与官方并排几可乱真）
  - 注：提取脚本会话中 tab 被用户浏览导航打断属正常，token 数据已取全
- [x] **本轮（14）· 官方关注流排版精修（浏览器爬取官方计算样式后应用）**
  - [x] 标题 18px/500/行高1.6；正文 15px/1.67；语义行 13px #8590a6（作者名加重）
  - [x] 动作行对齐官方：赞同胶囊（未赞=10%蓝底/已赞=实心蓝）+「▼」反对钮 +「n 条评论」+收藏+分享，14px #8491A5
  - [x] 右栏热榜改「大家都在搜」式：橙点前 3 + 热/新标签
  - [x] 折叠侧栏支持**悬停展开**（鼠标靠近临时展开 176px 覆盖层，移开收回，不挤压内容列）
  - [x] 「打开没内容」排查：feed API 正常（降级时仍有本地语料池）；骨架屏已正常显示
  - [x] 截图 docs/screenshots/v10-follow.png
- [x] **本轮（15）· 骨架几何对齐官方（浏览器量得官方布局坐标后重建）**
  - [x] 官方几何（1470 宽实测）：logo 钉页面左边距 40px（不属于内容列）；左导航贴左；feed 定宽 704px 居中偏左；右栏 405px 贴右边距
  - [x] 顶栏改 relative+absolute 定位（logo 左 40 / 搜索视口居中 / 图标右 40），内容区改 flex 布局（nav 220/64 + main 704 + aside 405 ml-auto）
  - [x] 右栏升级为官方创作中心式：侦探中心卡（Lv1 徽章 + 双数据格 + 官方浅蓝双按钮 + 排行榜）、Agent 入驻平台卡
  - [x] 截图 docs/screenshots/v11-final.png（1470 宽与官方同视角对比）
- [x] **本轮（16）· 微动效落地 + 用户帖一级公民修复**
  - [x] 微动效：赞同点击→胶囊变实心蓝白字「已赞同 n」+ 数字 pop 弹跳（key 重放）；卡片入场 stagger（每卡 40ms 延迟）；阅读全文箭头旋转/收起切换；揭晓 pill 弹入；点赞接后端 /api/post/[id] vote 持久化；`AGENT_AUTONOMY=off` 等既有降级保留
  - [x] **修复**：用户真人帖此前只是"展示前插"，详情/点赞/评论接口不认识它——现在 `getPostDetail`/`commentOnPost` 回落 social 存储，详情页、点赞（votes 已持久化 2）、评论全部打通
  - [x] 截图 docs/screenshots/v12-final.png
- [x] **本轮（17）· 官方设计全方位提取与全站重构**
  - [x] Playwright 直爬 zhihu.com/follow 计算样式与全页色频 → 提取规格 docs/research/zhihu-design-extraction.md（官方 token 全表）
  - [x] 全站 token 对齐官方：白底/#191B1F/#373A40/#8491A5/#1772F6、官方字体栈（含 MiSans）
  - [x] 全站 emoji 清零 → components/Icons.tsx 线性 SVG 图标（含新增 Dice/Bolt/Flag/Info）
  - [x] 登录页重设计（手写体字标 + 官方式登录卡）；match/messages/shop/agents 字标统一
  - [x] 微动效：赞同点击实心蓝+数字 pop（落库）、卡片 stagger 入场、阅读全文箭头旋转、揭晓弹入
  - [x] 修复：用户真人帖详情/点赞/评论接口不识别（一级公民化）；点赞持久化验证（votes:2）
- [x] **本轮（18）· 三方向完成度审计 + 开源对标调研（3 个并行只读子代理逐文件核实 + GitHub 检索 5 个对标项目）**
  - [x] 审计+调研报告 → docs/research/feature-audit-and-oss-research.md（后端 85%/Agent 全 mock/对话闭环可用，含 file:line 证据、漏洞清单、P0-P2 行动计划）
  - [x] 关键事实修正：五类 Agent 表中 player-agent.ts / judge.ts 为虚指路径（已改真实状态）；**信息流帖子生成不经过 LLM**；全项目无 LLM 凭证，Agent 话术全走 mock；mock 词表 ⊂ 侦探词表（词表可秒破玩法）
  - [x] 高优缺陷：Vercel 下 JSON 落盘静默失效、限流不持久、伪装者 1 条消息强制开牌白拿 +50、锁注后可改注、反自曝 regex `\b` 中文失效、5 轮不强制开牌、bot 延迟为伪造元数据
  - [x] 对标结论：不引入框架；借鉴 deepwolf 的 PlayerView/透明信念模型、NULL-mat 狼人杀的三层 Prompt/复盘战报、generative_agents/ai-town 的居民记忆轻量版
- [x] **本轮（19）· 像素级骨架对齐 + 审计 P0 缺陷修复**
  - [x] 官方实测（1470 视口）：logo x40 / 导航卡 x42·w247 / feed 卡 x311·w704·圆角2px·无边框 / 右栏 x1122·w296；nav→feed 间距 22px、feed→右栏 107px、右边距 52px
  - [x] 我们的页面同视口实测修正后**四项坐标完全一致**（40/42·247/311·704/1122·296）；截图 docs/screenshots/v13-pixel.png
  - [x] P0 修复（对应 18 轮审计清单）：①反自曝正则 `\b` 中文失效 → 改中文友好匹配；②已锁注可改注 → submitGuess 拒绝二次锁定（且首猜即自动开牌，无改注窗口）；③伪装者 1 条消息强制开牌白拿 +50 → 生存奖需聊满 2 轮（room.round>=2）
  - [x] 实测：1 条消息+强制开牌 → 生存奖不再发放（双方 0 分）
- [x] **本轮（20）· 代码级设计提取（官方样式表命中规则 + CSS 变量实值）**
  - [x] 提取官方 CSS 变量实值与命中规则（ContentItem/SearchBar/VoteButton 系列）→ docs/research/zhihu-design-extraction.md §6
  - [x] 主蓝校准为 **#0066FF**（官方 .Button--primary 实测），全站统一；新增官方语义 token：--meta #535861 / --time #81858f / --frame #f8f8fa
  - [x] **搜索框聚焦渐变描边**（官方 is-focus 双层背景实现：#0090FF→#1772F6 border-box）照搬并运行时断言通过
  - [x] 语义行/时间颜色对齐官方变量（--meta/--time）
- [x] **本轮（21）· git 仓库初始化 + Exa/GitHub 开源调研 + 玩法升级设计 v2（用户点名方向：Agent 账号/频道、识破反馈进化、积分更好玩、真实人机对局）**
  - [x] **git 仓库已初始化**（main 分支，首次提交 10c3cb9，143 文件；提交前扫描确认 .env.local/.data/node_modules 零泄漏）
  - [x] Exa 三线调研（3 子代理，sources_reviewed=149）：①Agent 社交基座→结论不换框架，借 ElizaOS 记忆思想+Discourse 频道/user-api-key 语义（YSocial 29★ GPL、chirper 闭源均不可作基座）②识破反馈学习环→Reflexion+ExpeL+humanize-text 背书，无需微调，收集→压缩→注入→版本度量 ③积分与匹配→Manifold CPMM（~200 行 TS 可移植）、TuringChat 匹配队列+bot 30s 补位、Human or Not 论文拟人细节（乒乓结构/随机开场白/不透露对方猜测）
  - [x] **玩法升级设计定稿 → docs/game-design-v2.md**：天择引擎（识破理由→弱点档案→注入→evoVersion 识破率曲线，反失控护栏）/ Agent 账号平权+自建频道+agent_memory / 动态赔率（feed 共识池+逆向奖励、1v1 CPMM、多数/少数轮）/ 真实对局（匹配队列、AI 开场审问、伪装者无痕对称 UI、服务端 crypto.randomInt 公平分配）
  - [x] 排期对照 9/13 提交窗口（P0=天择引擎最小版 mock 可演示；CPMM/频道列 P2 未来工作）
- [ ] **天择引擎最小版**：识破理由弹窗（chips+自由输入，答了+5 筹码）+ `weakness_notes` 集合 + 生成注入（mock 规则版即可）+ 帖子 evoVersion 与识破率分桶（设计 §1）
- [ ] **feed 猜帖共识池**：pari-mutuel 分池 + 共识指数展示 + 逆向奖励（登录才可押，堵游客刷分）（§3.1-1）
- [ ] **对局对称化+bot 开口**：双方同一「辅助」按钮按身份出内容、任务卡改 1.5s 浮层、botOpening 开场提问链、delayFor 真实延迟（§4.2–4.3）
- [ ] **匹配队列**：等真人 30s + bot 补位（TuringChat 模式，内存+落盘队列）（§4.1）
- [ ] 后端底层持久化迁移（方案已定稿：backend-architecture-research.md 8 步；待用户提供 Supabase/Upstash 凭据或 Vercel 登录授权）
- [ ] 公网部署（DEPLOY.md 就绪；`npx vercel login` 需用户本人授权，用户暂缓）
- [ ] 直答 Agent 接入运行时（100 次/天，做官方 AI 池内容）
- [ ] 道具商店（伪装道具/侦探工具/反套路）接入对局
- [ ] 多人房（狼人杀式）模式；Agent 参与 1v1 对局（scope 已预留）
- [ ] 部署公网 Demo + 建代码仓库 + 产品说明计划书 + 演示视频（9/13 10:00 – 9/15 10:00 提交窗口，建议 9/13 尽早占位）

### 本轮约束（用户要求）
- **不自行执行生产构建/部署**（本轮仅跑了 `tsc --noEmit` 类型检查，零错误）。运行验证由用户自行执行（`cd web && npm run dev`）。

## 七、本次开发定稿的关键决策（新 Agent 必读）

1. **胜负由确定性逻辑结算**（scoring.ts），LLM 只生成内容不裁决 —— LLM 挂了积分系统不受影响（调研报告风险项 #4）。
2. **双方身份服务端密封**，客户端只拿脱敏视图（toClientRoom）；猜测/下注揭晓前互不可见。
3. **双层 persona prompt**（人设层 × 目标层，借鉴 wolfcha）：装 AI 套人设，装人用普通网友语气。
4. **bot 跟注压力**：玩家锁注后 bot 立即跟注开牌（botLockNow），避免对局卡死。
5. **存储抽象**：GameStore 接口 + 内存实现；上 serverless 前必须换 Supabase/Upstash（实例间内存不共享）。
6. **凭证安全**：Secret 只读环境变量；服务端出站仅固定官方域名，拒绝私有/环回地址（防 SSRF）。
7. 已知坑：`pkill -f "next start"` 杀不掉 `next-server` 进程，重启服务器要用 `lsof -ti:3000 | xargs kill -9`。

## 八、协作规则

1. **不要重复造轮子**：优先用 skill 文档里的现成接口、调研报告里的开源方案。
2. 改动游戏规则先改 `docs/game-design.md`，再改代码，保持文档-代码一致。
3. 凭证安全：任何 Secret 只进 `.env.local`（已 gitignore），示例用占位符。
4. 每个子 Agent 完成任务后：写产出文件 + 在本文件「进度看板」勾选 + 修改必要的说明。
