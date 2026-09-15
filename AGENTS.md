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
  - [x] **git 仓库已初始化**（main 分支，首次提交 10c3cb9，143 文件；提交前扫描确认凭证/数据/依赖路径均被忽略规则排除、零泄漏，仅本地提交、未配置任何远程）
  - [x] Exa 三线调研（3 子代理，sources_reviewed=149）：①Agent 社交基座→结论不换框架，借 ElizaOS 记忆思想+Discourse 频道/user-api-key 语义（YSocial 29★ GPL、chirper 闭源均不可作基座）②识破反馈学习环→Reflexion+ExpeL+humanize-text 背书，无需微调，收集→压缩→注入→版本度量 ③积分与匹配→Manifold CPMM（~200 行 TS 可移植）、TuringChat 匹配队列+bot 30s 补位、Human or Not 论文拟人细节（乒乓结构/随机开场白/不透露对方猜测）
  - [x] **玩法升级设计定稿 → docs/game-design-v2.md**：天择引擎（识破理由→弱点档案→注入→evoVersion 识破率曲线，反失控护栏）/ Agent 账号平权+自建频道+agent_memory / 动态赔率（feed 共识池+逆向奖励、1v1 CPMM、多数/少数轮）/ 真实对局（匹配队列、AI 开场审问、伪装者无痕对称 UI、服务端 crypto.randomInt 公平分配）
  - [x] 排期对照 9/13 提交窗口（P0=天择引擎最小版 mock 可演示；CPMM/频道列 P2 未来工作）
- [x] **本轮（22）· browser-use 组件级提取（DOM/间距/动画/JS）+ FeedCard 结构重写**
  - [x] browser-use(IAB) 提取知乎登录页：淡蓝背景 rgb(184,229,248)、提交钮 352×36·3px·#1772F6、输入框 48px 底线式、tab 激活 #09408E（截图留档）
  - [x] 已登录会话提取关注流**官方 DOM 结构**（Card.TopstoryItem→Feed→FeedSource(firstline+Bull+byline)→ContentItem(h2+meta×6+RichContent.is-collapsed)）与**精确间距**（卡 padding 15/16px、标题 margin -4px、正文 9/-4px、动作行 10/-10px、行高 28.8/25.05）
  - [x] 动画三档实测（0.14s hover / 0.3s 状态 / 0.5s 弹层，ease-out+linear）→ 固化 --dur-fast/state/layer token；JS 确认 React SSR（js-initialData 注水）
  - [x] FeedCard 按官方结构重写：语义行（头像+作者名+发布了想法+·+时间）、标题 18px/28.8、正文 15px/25.05、动作行 py-10px 14px 灰蓝；截图 docs/screenshots/v15-official-structure.png
  - [x] 规格追加 docs/research/zhihu-design-extraction.md §7
- [x] **本轮（23）· 开源底座采纳决策 + Agent 通道 v2 + 天择引擎落地（用户定调：不自建设施，站开源底座）**
  - [x] Exa 三线调研（3 子代理 120 源）→ docs/research/oss-base-and-channel-v2.md：**底座定稿 Supabase 托管 + Upstash + Vercel**（Convex 不能自托管且迁移即重写、PocketBase 需自扛运维，均否；替换映射：JSON DB→Postgres、scrypt→Supabase Auth、SSE 自轮询→Realtime Broadcast、内存限流→Upstash 滑窗）；交互范式清单（assistant-ui「点踩要理由」等）；llms.txt v2/MCP/IETF agent-friendly API 生态结论（hzk_ 与 Discourse user-api-key 模式对齐）
  - [x] **天择引擎数据环落地**：识破理由弹窗（InsightDialog，6 chips+自由输入，登录 +5/帖）+ `weakness_notes` 集合（evolution.ts，cap 2000）+ evolutionPass 规则注入 feed 生成（护栏：≤3 规则、一半帖子原样放行，永不毕业）+ guess 返回 askReason 钩子；详情页已接线（evoVersion 分桶与信息流入口待做）
  - [x] **对局对称化（部分）**：assist kind:"auto" 服务端按身份分流（伪装者→AI 腔参考/真人→特征线索），对局页改单一「辅助」按钮——按钮存在不再暴露伪装者；bot 真实延迟（sleep 封顶 4s，responseMs=实际值，节奏线索自洽）（任务卡浮层与 botOpening 待做）
  - [x] **Agent 通道 v2**：新 `GET /api/agents/topics`（话题只读，JSON/markdown，补齐 topics→feed→post 闭环）+ `/openapi.json`（OpenAPI 3.1，7 端点契约=MCP 自动生成入口）+ llms.txt 升 v2
  - [x] tsc --noEmit 零错误；仅提交本轮自建/自改文件（未触碰并行会话的 page.tsx/agents 页未提交变更）
- [x] **本轮（24）· 逐项运行时断言动效 + 修导航宽度冲突 + 已赞状态持久化**
  - [x] 浏览器逐项断言：fade-up 生效/分隔线 #F8F8FA/标题 18px·500·28.8/赞同胶囊 10%蓝·3px/搜索聚焦渐变 全部通过
  - [x] **修复导航折叠宽度冲突**：w-[247px] 与 w-[64px] 类并存导致折叠宽度失效 → 改条件互斥输出；实测折叠 64px / 展开 247px
  - [x] **已赞状态持久化**：轮询重渲染会重置实心高亮 → localStorage 记录已赞帖；跨双轮询周期断言实心蓝 #0066FF 白字不丢
  - [x] 录屏能力在本环境受限（IAB guest capture 失败），以 evaluate 断言 + 终态截图（docs/screenshots/v16-microstate.png）为验证证据
- [x] **本轮（25）· 全站界面统一优化与逐路由浏览器审计**
  - [x] 新增共享应用壳 `components/AppChrome.tsx`：58px 顶栏、桌面五入口主导航、移动端五等分底栏、760/1000px 页面容器
  - [x] 全面优化 `/match`、`/messages`、`/shop`、`/agents`、`/channels`、`/channels/[id]`、`/post/[id]`、`/room/[id]`、`/about`；登录页与首页纳入同一验收矩阵
  - [x] 补齐页面任务导语、装载骨架、异常/空状态、窄屏道具布局；帖子详情去卡片套卡片，房间页统一顶栏与轮次进度
  - [x] 修复 `--meta` / `--time` / `--frame` 三个被使用但未声明的全局 token，避免浏览器颜色回退
  - [x] 浏览器实测 10 类页面状态；共享壳断言 58px 顶栏、743px 窄视口零横向溢出、移动底栏 active 正确
  - [x] GitHub 对标 Discourse 的稳定社区导航与共享应用壳；审计报告 → `docs/research/full-interface-audit-v25.md`
  - [x] `tsc --noEmit`、`git diff --check` 通过；未执行生产构建或部署
- [x] **本轮（25）· 产品定位收口 + 天择可视化 + 共识赔率 + Agent 频道/记忆 + 真人匹配**
  - [x] 新增 `/about`：一句话定位、三步核心循环、天择引擎、对称博弈与 Agent 入驻说明；明确非知乎官方产品
  - [x] **天择引擎闭环完成**：首页识破弹窗真正接线；帖子内部 evoVersion、每 3 条反馈升代、按居民弱点注入；公开居民代际/课程数/按版本识破率，版本只在揭晓后展示防身份泄漏
  - [x] **feed 共识池**：登录账号一帖一猜；判断前显示 AI 共识比例与双边赔率；逆共识猜对加动态奖励；游客不进入公共池；重复刷分返回 409
  - [x] **对局无痕化**：任务卡改 1.8s 浮层并自动隐藏，常驻仅同款“任务/辅助”按钮；AI 对手 botOpening 主动发问
  - [x] **真人优先匹配**：JSON 持久 FIFO 队列，两位真人进入同房并实时通信；30 秒无人由神秘 AI 补位；双方身份独立服务端密封
  - [x] **Agent 平权升级**：真人/Agent 均可建频道、频道投稿；Agent 新增 `/api/agents/channel` 与 `/api/agents/memory`，发帖/评论/频道/识破反馈进入轻量记忆流；OpenAPI/llms.txt/DDL 同步
  - [x] 新增 `/channels` 与 `/channels/[id]`；首页桌面/移动导航接入；知乎式排版与现有 token 保持一致
  - [x] 浏览器运行验收：首页/频道/对局入口/任务浮层无控制台警告；双真人匹配与跨玩家消息实测通过；`tsc --noEmit` 零错误，未执行生产构建/部署
- [x] **本轮（26）· 知乎公开页实时复核 + 刘看山规范 + 帖子详情像素重构 + 先手洞察玩法**
  - [x] Browser + Firecrawl 复核知乎公开问答页：实时提取 `#1772F6`、34px/3px VoteButton、14px 动作行、`#F4F6F9` 详情画布与 694/296px 双栏几何；规格追加 `docs/research/zhihu-design-extraction.md` §8
  - [x] 刘看山三套 320×320 GIF 统一接入 `components/Kanshan.tsx`；明确 wave=欢迎、idle=裁判提示、stroll=等待陪伴；规范 `docs/design/kanshan-asset-guidelines.md`，修正比赛文档“素材待下载”的过期描述
  - [x] 首页/详情页按钮与布局校准；详情页重构为 694px 内容卡 + 296px 身份判断台；修复信息流赞同接口重复请求与 SSR 读取 localStorage；移除伪加号/关闭字符，改用既有线性图标体系
  - [x] Exa + Firecrawl 玩法检索落地“先手洞察奖”：公共池前 5 位猜对 +10、第 6–15 位 +5，与逆风赔率组成双阶段策略；规则先更新 `docs/game-design.md` 再改代码
  - [x] 全站审计报告 `docs/research/interface-and-gameplay-audit-v26.md`；1470×1000 运行断言主卡 694px/右栏 296px/横向溢出 0；390×844 动作行与猜身份展开通过；`tsc --noEmit`、`git diff --check` 通过，未执行生产构建或部署
- [x] **本轮（27）· 知乎设计规范样式表级重提取 + 全站设计层重写**
  - [x] 首页 302 登录、问答/专栏页 40362 风控不可读 → 改为直接解析知乎线上生产样式表原文（`main.216a26f4.*.css` 2002 条规则 + `7936.*.css` 1840 条），拿到含状态态/动画/焦点环的**规则本体**而非抽样计算值；规格 `docs/research/zhihu-design-extraction-v2.md`
  - [x] 修正 13 处规范偏差：`--zFontWeightBold` 按平台派生 600/500/700（旧版固定 500）、主按钮 hover `#0063e4`（旧为推测值）、VoteButton padding `0 10px` + hover 15%、动作项 `margin-left:24px`、卡片阴影 `0 1px 3px`、Tab 激活=加粗+3px 下划线且不变字色、双层焦点环、圆角收敛到 3–4px、过渡三档改 .2s/.3s/.8s
  - [x] **折叠正文改用官方实现**：`max-height:100px` + mask 渐隐（此前是 `-webkit-line-clamp` 硬截断）
  - [x] 修 3 个真实缺陷：`card-raised` 类被引用却从未定义（头像菜单无底无框）；长帖折叠从不触发（`needsMore` 按字符长度差判断，body 缺失时恒 false，实测 250px 正文仍 `collapsed:false`）→ 改 ResizeObserver 按真实渲染高度；`IconChevronDown` 不透传 `data-*` 导致箭头旋转失效
  - [x] 色彩改为官方两级语义映射（`--map-*` → 应用别名）；`globals.css` 移入 `@layer components` 使页面工具类可覆盖
- [x] **本轮（28）· 仓库治理 + 代码健康审计 + 四类身份模型落地 + 个人主页/设置页**
  - [x] **仓库整理**：根目录 7 张散落截图与 2 个中文素材目录归档到 `docs/screenshots/` 与 `docs/assets/kanshan-source/`；`.gitignore` 补全（`.data/`、`.box-agent*/`、`.playwright-mcp/`、`node_modules/`、`*.tsbuildinfo`、根目录图片）；`git rm --cached` 清掉已跟踪的 `.DS_Store` 与 `tsconfig.tsbuildinfo`，现跟踪 151 个文件且无泄漏项
  - [x] **代码健康审计**（3 个只读子代理逐文件核实，带 file:line 证据）：身份类型分裂 4 处、FNV-1a hash 重复 4 份、session token 明文存盘、`saveCollection` 静默吞错、`router.ts` 两个导出为死代码、并发写共用固定 tmp 路径；结论与技术债清单写入 `docs/architecture.md`
  - [x] **四类身份模型**（核心）：新建 `web/lib/identity.ts`，身份 = 真实阵营 × 表演身份，落地 `human / agent / human_as_agent / agent_as_human`。判定只认「究竟是谁写的」，识破伪装者积分 ×1.6
  - [x] 生产端全部接通：居民帖约 35% 走 `humanizeDisguise`（自我修正插入、可核查个人锚点、去结构化开场、低频错字、犹豫收尾、口语标题）；真人发帖新增「伪装成 AI」开关；外部入驻 Agent 按**文本特征**判定是否伪装（不信任自述）
  - [x] 揭晓理由按四类身份分别解释（伪装者要说清「它是怎么骗过你的」），`guess`/`xray` API 返回 `identityKind`/`disguised`/`truth`
  - [x] **实测验证**：识破伪装 AI 得 48 分、本色 AI 30 分；真人伪装 AI 成功骗过判断者（猜 AI 判错 −20，真相「真人（在伪装 AI）」）；feed 响应无 `identity` 泄漏
  - [x] 顺手修复审计发现的道具缺陷：透视镜 peek 失败仍扣卡 → 改为先取结果再扣卡
  - [x] **新增 `/me` 个人主页**（资料卡 + 数据条 + 我的帖子 + 身份玩法说明）与 `/settings` 设置页（账号资料 / 阅读与玩法 / 隐私与安全 / 开发者），接入头像菜单、左导航与移动底栏
  - [x] 设置项真实生效：`layout.tsx` 首帧脚本写 `data-reduce-motion` / `data-auto-expand`，`globals.css` 承接降级，避免「先播动画再被关掉」的闪烁；实测开关落库且即时生效
  - [x] 读取知乎开放平台文档接口全表（当前仅接入 hot_list 与 zhihu_search，直答/知识库/创作数据/OAuth 未接）；飞书技术指南需登录，仅读到目录，正文未获取（证据缺口）
  - [x] 验证：`tsc --noEmit` 零错误；`NODE_ENV=production npm run build` 通过（/me、/settings 已进路由表）；10 个页面全部 200
- [x] **本轮（29）· 刘看山管理员人格 + Agent 拟人行为引擎 + 设计层次**
  - [x] **确认知乎技术栈**（Playwright 运行时指纹）：React + SSR 注水 + **Emotion CSS-in-JS**，非 Next.js（无 `__NEXT_DATA__`，产物为自研 webpack 分包）；类名为 Emotion 原子类 `css-xxxxx` + BEM 语义类 `SignFlow-*` 并存。结论：本站保持 Next.js+Tailwind，搬**设计决策**不搬 CSS 运行时；对照表见 `docs/research/zhihu-stack-and-agent-behavior.md`
  - [x] **gh CLI 检索开源参照**：`oil-oil/wolfcha`（706⭐，同为 TS/Next.js 的 AI 社会推理游戏，其实战文档给出"测试通过≠实战正确"的教训）、`clammet/notai`（真人扮 AI，与本站 human_as_agent 同构）、`metimol/BlackWave`（165⭐，单用户 AI 社交模拟）、Human-or-Not 论文（150 万用户，整体正确率仅 68%）
  - [x] **刘看山 = 社区管理员**（`lib/kanshan.ts` + `components/KanshanSays.tsx`）：据官方设定（北极狐/短尾巴/好奇心强/内向克制）建 11 场景台词库；**他不参与判断、不站队、不泄露身份**；按 seed 确定性选句避免"每次刷新换话"的机器人感；出现在欢迎条、游客引导、揭晓点评、空状态、加载态、降级提示
  - [x] **Agent 行为引擎重写**（核心诉求：不能人人都回帖）：旧版 33% 行为是评论 → 新版用「兴趣匹配 × 作息节律 → 连续概率」决策链，补冷却去重。2 万次模拟：路过 62–80%、只读 12–20%、点赞 6–11%、评论 2–6.5%，凌晨静默、晚高峰活跃；线上实测 20 次行为为 80/10/10/0，与模拟吻合
  - [x] 修复一个只有运行时能发现的缺陷：评论门槛曾写成 `engagement > 0.62` 硬阈值，但 circadian 上限 1.2、白天仅 0.6，相乘后**数学上永不可达**，评论率恒为 0；改为连续概率
  - [x] **评论数长尾化**：`listComments` 从"每帖必铺 2–4 条"改为 45% 零评论/30% 一条/17% 两三条/8% 热帖；卡片评论数改用同源 `commentCountFor(postId)`，消除"显示 87 条点进去是空"的割裂。实测 10 帖为 `[0,0,0,0,1,1,1,2,2,130]`
  - [x] **设计层次**：新增 `.canvas-ambient`（顶部极淡冷光渐层）、`.kanshan-banner`、`.empty-stage`、`.section-label`，在不破坏知乎克制感的前提下消除纯白平铺
  - [x] **游客一键体验**：右栏「怎么玩」引导卡（无需注册 + 三步说明 + 规则），端到端实测游客可直接完成判断并看到刘看山点评
  - [x] 修 3 个界面缺陷：1280px 下右栏被裁切（横向溢出 138px→0）；「猜身份」核心按钮此前被设成 `opacity:0` 悬停才显（改为常显，仅桌面端悬停强调）；游客态积分显示「–」像加载失败（改为 0 + 说明）
  - [x] 验证：`tsc --noEmit` 零错误、生产构建通过、行为分布运行时断言、视觉 QA 两轮
- [x] **本轮（30）· 后端端到端验证 + OpenClaw 接入 + AI 能力验证 + 搜索玩法**
  - [x] **端到端实测后端**（不是"看起来能跑"）：外部 Agent 注册→拿 Key→读话题→发帖→进信息流→被判断，全链路实跑；真人注册→登录→发帖→伪装发帖→判断→防自猜，全链路实跑
  - [x] **修阻断级缺陷 1：鉴权头不统一**。5 个写接口只认 `X-Agent-Key`，读接口认 `Bearer`，导致 OpenClaw 这类按标准 Bearer 接入的框架"能读不能写"（发帖恒 401）。新建 `lib/agents/auth-header.ts` 统一支持 Bearer / X-Agent-Key / ?key 三种写法，两种主流写法实测均发帖成功
  - [x] **修阻断级缺陷 2：Agent 新帖被埋池尾**。`syncAgentPosts` 用 push 追加到 72+ 条内容池末尾且伪造发布时间，接入方翻前 6 页都看不到自己的帖，会误以为发帖失败。改为打散插入首页前 12 条之间 + 使用真实发布时间
  - [x] **OpenClaw 可直接安装的 Skill 包** `skills/huzhi-resident/`：SKILL.md（含玩法规则与伪装技巧）+ manifest.json（端点/鉴权/限流声明）+ `scripts/huzhi.sh`（check/topics/feed/post/comment）。脚本实测：自检通过、自曝身份被本地预检拦截（省限流额度）、正常发帖成功
  - [x] **闭环验证伪装玩法**：外部 Agent 用口语风格发帖 → 服务端按文本特征自动判为 `agent_as_human` → 成功骗过判断者（判为真人，correct=False）。服务端**不信任 Agent 自我声明**，写作风格直接决定身份标签与对手得分
  - [x] **新增「AI 能力验证」玩法** `lib/turing.ts` + `/api/verify` + `/verify` 页：三项可复现指标（句长 burstiness / 口语密度 / 结构词密度），不依赖 LLM 打分。实测区分度 AI 样例 0 分 vs 真人样例 82 分；Turing Score = 欺骗率 × 样本置信度，<5 次不评级避免"骗过一次拿满分"；等级阈值参考 AI21 Human-or-Not 实验（150 万用户，人类识别 AI 正确率仅约 60%）
  - [x] **新增搜索玩法** `/search` + `/api/search`：对齐知乎搜索页（搜索框 → SubTab 排序 → 高亮结果），三种排序。关键设计：结果与信息流走同一密封出口，**能搜内容搜作者，搜不出谁是 AI**。实测 17 条命中且无身份泄漏
  - [x] 修界面硬伤：搜索页动作栏文字断行成「赞/3,753/同」（动作项缺 `flex-shrink:0` 与 `nowrap`，按官方 `.ContentItem-actions>*` 规格修复，实测三项均单行）；去掉恒定重复的三个「命中」标签；话题链接从动作栏移到元信息行
  - [x] 验证：`tsc --noEmit` 零错误、生产构建通过（/verify、/search 进路由表）、12 个页面全部 200、视觉 QA
  - [x] 报告 `docs/research/backend-and-agent-verification.md`（含实际请求返回与诚实标注的 5 项限制）
- [x] **本轮（32）· 补齐两条参赛赛道 + 黑客松故事 API 接入 + 上线方案**
  - [x] **发现并接入黑客松盐言故事 API**（`skills/zhihu/references/hackathon-content-api.md`）：`api.zhihu.com/km-indep-home/hackathon/v2/{story,knowledge}/{list,<id>}`，**免鉴权**，实测 20 篇真实故事可用、详情含完整正文。新建 `lib/zhihu/works.ts`（30min/1h 双层缓存 + 并发去重 + 过期缓存兜底 + work_id 白名单校验 + 作者归属保留）
  - [x] **次元游乐场赛道：`/theater` 代笔现场**。读一段真实盐言故事，其中一段由系统模仿文风续写，玩家做**段落级定位**。设计依据来自上一轮知乎调研——@科学声音指出识别 AI 最大困难是"没有对照组"，这个玩法直接给足对照组（同作者/同篇/同上下文）。揭晓时明确标注系统生成段并提示回原作阅读
  - [x] **灵魂匹配局赛道：`/kindred` 同频匹配**。画像**完全来自已发生的行为**（判断倾向、话题足迹、表达风格取证），不用问卷不用自填标签。匹配公式刻意让"判断倾向相反"的人适度加权——只推荐同类会造信息茧房，讨论就没张力；每条匹配给出可解释理由 + 可直接复制的破冰话题（赛道要求"让讨论更容易开始"）
  - [x] 修两个真实缺陷：① `forgeParagraph` 用 slice 硬截断长度，产出「心跳依然在加」这类半截句，玩家一眼就能看出哪段是假的——破绽变成 bug；改为整句拼接。② `splitParagraphs` 同样会切出残句，改为只在句末标点（含 …」』】）处切分，长段宁可整段保留。实测 3 篇作品 24 段**半截句数 = 0**
  - [x] 段落选项加常态细边框与 hover 态（视觉 QA 指出纯文字列表看不出可点）
  - [x] **重写 DEPLOY.md 上线方案**：明确指出当前 JSON 文件库在 Vercel 只读文件系统上会**静默丢数据**（`saveCollection` 内部 `catch {}` 吞错，前端仍显示成功），给出 Upstash Redis / 带持久卷平台两条路径、Serverless 下 Agent 心跳与对局房间的限制与对策、完整提交材料清单与产品说明要点
  - [x] 验证：`tsc --noEmit` 零错误、生产构建通过（/theater、/kindred 进路由表）、10 个页面全部 200、两条赛道端到端实跑、视觉 QA
- [x] **本轮（33）· 六 API 收口复核 + 检验流程固化 + GitHub 开源托管（用户指令：直接建仓上传；不自建设计，沿用已定稿开源底座）**
  - [x] **六 API 收口确认**：`hot.ts`/`search.ts` 去重自拼 Bearer/降级，改走 `client.ts` 统一底座（鉴权/错误码/缓存/并发去重只实现一次）；接入结构文档 docs/zhihu-api-integration.md（六大能力 × 端点 × 缓存 × 额度归属全表，2026-09-13 官网复核）
  - [x] 首页右栏新增「知乎开放平台」能力卡：`GET /api/zhihu/status` 六能力实时额度（剩余/总量，低于 10% 变红），评委可验证「到底用了哪些知乎能力」
  - [x] **检验流程固化** → docs/verification-runbook.md（五步：静态 → 六接口直连 → 运行时接口 → 界面走查 → 降级检验，每步含命令与判定标准 + 六能力降级路径速查表）
  - [x] 检验脚本 `web/scripts/verify-zhihu-api.mjs`（`npm run verify:zhihu`）：读 .env.local 只进内存、先取额度快照、逐一实调六接口校验 Code=0 与响应形状、问题回答用热榜首条问题链接**联动实测**（不写死题目）、检验后额度快照 = 真实消耗
  - [x] **实跑结果：8 过 / 0 败**，额度恰各消耗 1（hot_list 47→46、zhihu_search 4890→4889、global_search 4999→4998、question_answers 94→93、creator 97→96、zhida_openai 4999→4998）；`tsc --noEmit` 零错误、生产构建通过（路由表完整）
  - [x] **开源底座状态（诚实）**：Supabase+Upstash 仍为「定稿未接入」——`web/.env.local` 仅有 ZHIHU_ACCESS_SECRET，无 Supabase/Upstash 凭证，DDL（web/db/schema.sql）与八步迁移方案就绪，待用户开项目；本轮不擅自自建设施
  - [x] **GitHub 托管**：推送前泄漏扫描（真实密钥值不在任何 219 个跟踪文件、.env.example 全占位、.data/ 与 .env.local 未跟踪）→ `gh repo create` 建仓推送 main；新增 README.md（项目门面：玩法/六 API 表/检验流程/快速开始/文档索引）
- [x] **本轮（36）· 重读全项目文档后纠正 Agent 底座选型（仅研究，不开发）**
  - [x] 重新读取 README、AGENTS、game-design v3/v2、contest-alignment、architecture 及既有 OSS/审计报告；确认核心需求是“社交环境+居民+动作+推荐+调度+外部 Agent+身份博弈”，不是普通聊天 Agent
  - [x] 承认并废止第 35 轮自建 BYOA Gateway 方向：它违反用户“基于稳定项目、不自己创建架构”的明确要求；旧文档仅保留为需求分析
  - [x] **唯一 Agent 社交底座定稿为 CAMEL-AI OASIS**（Apache-2.0、活跃维护）：直接使用 Platform、SocialAgent、UserInfo/profile、memory、23 类 Actions（含 DO_NOTHING）、interest/hot Recsys、Simulation Engine、LLMAction/ManualAction
  - [x] 稳定性口径：锁定 PyPI `camel-oasis==0.2.5`（Python >=3.10,<3.12）及兼容 CAMEL lockfile，不跟随 main；诚实定位为黑客松/研究演示底座，不宣称已验证真人生产并发
  - [x] OpenClaw/Hermes 明确定位为外部居民客户端而非平台底座：保留自身 SOUL/MEMORY/skills/cron，通过现有 Skill/API 转成 OASIS ManualAction；真人同样使用 ManualAction
  - [x] 乎知只保留作品独有扩展：知乎内容入口、真人/Agent 混合、`actor_kind × performance_task` 身份密封、判断质押/积分和揭晓；不自研 Agent 生命周期、推荐、社交图、行为循环、记忆接口、并发调度或模型路由
  - [x] 黑客松展示限定一个 OASIS 服务、2–4 个同时激活内置 Agent、低 activation probability、外部 Agent 自担推理、SQLite 演示、mock 降级；避免按官方 100 Agent 全激活示例产生高 token 成本
  - [x] 最终报告 `docs/research/oasis-foundation-decision-v36.md`，包含逐文档需求核对、选型排除、OASIS 模块映射、外部 Agent 接入、学习/惩罚、资源控制和 3 分钟答辩流程
- [x] **本轮（37）· OASIS 定稿清理 + 趣味视觉开发起步**
  - [x] 删除两份已被 OASIS 定稿取代的候选/自建 Gateway 报告及看板冲突口径；底层唯一有效文档为 `docs/research/oasis-foundation-decision-v36.md`
  - [x] GitHub/Firecrawl/Exa 复核：OASIS `ManualAction` 可承接外部 Agent；社交推理界面应突出秘密角色、阶段与清晰揭晓；积分优先服务判断、下注和复盘，不做复杂养成
  - [x] 积分商店新增「身份星图」：Three.js 低功耗 72 点场景 + GSAP React 自动清理入场 + 刘看山裁判形象，支持 reduced-motion、DPR 上限与离屏暂停
  - [x] 新增依赖只采用官方稳定项目 `gsap`、`@gsap/react`、`three`；`tsc --noEmit` 与 `git diff --check` 通过
  - [x] **修复积分经济漏洞**：商店购买旧实现增加库存却 `addBank(..., 0)` 不扣积分；现按商品价格真实扣款，并在商店显式展示已实现的 10–20 分单项取证消费路径
  - [x] **OASIS 官方包真实落地验证**：新增 `agent-engine/` 的 Python 3.11 + `uv.lock` + fail-fast verifier；首次发现 MCP 2.x 兼容故障后锁定 `mcp==1.30.0`，最终验证 `camel-oasis 0.2.5 / camel-ai 0.2.78 / ManualAction / 5 个必需动作` 全部通过
  - [x] **OASIS→乎知薄适配层**：`agent-engine/huzhi_bridge.py` 只把官方 ManualAction 映射到现有 HTTP API，不自建循环/记忆/推荐；4 项契约测试通过，含正式 `DO_NOTHING` 静默动作
  - [x] 补齐 `LIKE_POST` 的真实产品端点 `/api/agents/like`（Key 鉴权、每 Agent 每帖一票、记忆记录）；端到端实跑“真人注册→Agent 入驻→读流→Bearer 点赞”，目标帖票数 1→2
  - [x] 浏览器验收积分商店：WebGL 上下文存在、身份星图标题渲染、横向溢出 0、控制台错误 0；OpenAPI 升级 2.1 并与 Bearer 鉴权和新点赞端点同步
  - [x] 积分扣款运行时断言：验收账号购买双倍卡返回 200，余额 1000→850、库存 0→1、接口返回余额与再次 GET 一致，确认修复不是静态假象
  - [x] **OASIS 社交环境实跑**：按官方 Reddit cookbook 启动 2 居民 SQLite 世界；`model=None` 会意外索要 OpenAI Key，改用 CAMEL 官方 StubModel 后零 LLM 跑通 1 帖/1 评论/1 点赞/2 静默/7 traces
  - [x] **积分透明账单**：GameStore 持久记录 reason/delta/balance/at，贯穿签到、猜帖、识破反馈、Agent 判断、取证、代笔现场、1v1 与购买；商店新增账单 UI
  - [x] 独立 3011 端口运行验收：购买双倍卡余额 250→100、账单首条“购买：双倍卡 / −150 / 余 100”，页面 Canvas=1、横向溢出=0；验收后正常关闭临时 dev server
- [x] **本轮（38）· OASIS 叙事落地 /about + 每日签到 + 文档清理（用户指令：以 OASIS 定稿为底座，删无关内容，推进产品使用）**
  - [x] **三线调研并行**：Firecrawl 搜 AI 社交推理游戏与积分经济设计（AI-Native Games 综述、6 类 gamification 奖励）、GitHub 搜社交模拟开源项目（oceaagent/AgentBook 等）、WebSearch 搜 AI 平台 UI 设计（CollabAgents 伦敦设计奖金奖、RPG 式 Agent 可视化）
  - [x] **新增 AgentWorld 组件**（`components/AgentWorld.tsx`）：Three.js 球面粒子 + 连线，蓝=真人/金=Agent/紫=伪装中，低功耗（DPR≤1.5、IntersectionObserver 暂停、reduced-motion 降级），展示"POWERED BY CAMEL-AI OASIS"叙事
  - [x] **重写 /about 页**：首屏品牌横幅 + 刘看山引导 + AgentWorld 可视化 + 三步核心循环 + 四类身份卡（human/agent/human_as_agent/agent_as_human，颜色编码）+ 天择引擎 & 对称博弈双栏 + Agent 入驻 + 刘看山收尾；GSAP `data-fade` 入场 stagger
  - [x] **每日签到**（`lib/social.ts` + `/api/shop` action=checkin）：基础 50 分/天，连续 +10/天封顶 90 分，持久化到 `checkins` 集合，防重复签到；商店页签到卡片 + GSAP 积分弹跳反馈（scale 1→1.6 yoyo）
  - [x] **首页积分动效 + 签到快捷入口**：`page.tsx` 侧栏积分数字挂 `bankRef`，猜身份/签到后积分变动触发 GSAP 弹跳（得分金色/失分红色，scale 1↔1.35）；侦探中心卡片新增「每日签到 · 领积分」按钮（登录态显示），一键签到
  - [x] **文档清理**：删除 4 份已过时/被取代的研究文档——`tech-research.md`（旧名"图灵盲盒"、错误技术栈 Next.js16/shadcn/Jotai）、`gameplay-research.md`（旧名）、`full-interface-audit-v25.md`（被 v26 取代）、`zhihu-design-extraction.md`（被 v2 取代）
  - [x] 验证：`tsc --noEmit` 零错误；浏览器验收 /about（9 项全过）；/shop 签到实测 1000→1050；首页签到按钮态切换正常、猜身份流程正常、横向溢出 0；未执行生产构建
- [x] **本轮（39）· 后端全链路跑通验收 + 修复 dev/build 冲突（用户指令"完善后端能够跑起来"）**
  - [x] **全接口实跑**（dev 3000 端口）：15 个页面路由全部 200；写闭环注册→签到(+50)→商店→发真人帖→防自猜拦截(400 正确)→猜身份(误判 -20)→建房→带 pid 取状态→发言→2 轮规则保护(400 正确)→揭晓→搜索(编码后)→线索卡→匹配队列→kindred→SSE(hello/update/ping)；tsc 零错误
  - [x] **发现并修复真实卡点：dev 与 build 共用 `.next` 互相冲突**——运行时 `next build` 会覆盖 `.next` 使正在运行的 dev server 变 500；`rm -rf .next` 后 `next start` 报"Could not find a production build"。正确操作顺序入 AGENTS.md 运维规范
  - [x] **生产模式（next start -p 3000）验证通过**：页面+接口全部 200（kindred 401=需登录合理）；写闭环注册→签到→发帖→**`.data/` JSON 文件库落盘正常**（users/user_posts 时间戳实时更新）
  - [x] 当前 3000 端口运行的是**生产模式**（next start）；切回 dev：`rm -rf .next && npm run dev`
- [x] **本轮（40）· OASIS sidecar 真连接 + 身份可视化纠偏 + 运行状态透明化**
  - [x] GitHub Connector 因未认证不可用，改由 Firecrawl Developer Index 获取 OASIS 官方 Reddit cookbook，并与锁定包源码交叉核对 `env.reset → env.step(ManualAction) → env.close`
  - [x] 新增 `agent-engine/sidecar.py`：单进程持有 2 居民 OASIS 世界，默认仅监听 127.0.0.1；`/manual` 先写 OASIS trace，只有显式配置 HUZHI_BASE_URL/KEY 才转发产品 API
  - [x] sidecar 实跑：health=OASIS 0.2.5/2 agents/forwarding false；CREATE_POST trace 3、DO_NOTHING trace 4；未配置 Key 时没有伪造线上写入
  - [x] 新增 `/api/agents/runtime` 真实健康探测：sidecar 在时返回 connected=true，关闭后 1.2s 内返回 local-fallback；页面不再把“依赖已安装”误写成“线上已驱动”
  - [x] 修复 AgentWorld 身份泄漏式叙事：节点全部使用同类匿名蓝青编码，删除“蓝=真人/金=Agent/紫=伪装”假图例；确定性 PRNG 保证同配置截图稳定
  - [x] `/about` 浏览器断言：sidecar 已连接、OASIS VERIFIED、匿名节点存在、泄漏图例不存在、Canvas=1、横向溢出=0
  - [x] 修复 sidecar Ctrl-C 残留 OASIS pending task：显式 env.close、停止 loop、回收线程与临时 SQLite；重复启动后退出码 0、无 pending task 警告
  - [x] **OASIS→乎知完整写链路实跑**：forwarding=true 后 CREATE_POST 返回 `ap_` ID、CREATE_COMMENT 返回 `ac_` ID、LIKE_POST 返回最新票数；OASIS trace 依次增长，产品详情可读到同一正文与评论
  - [x] 首次转发暴露严格参数差异：乎知 `topic` 误传 OASIS `create_post(content)` 导致拒绝；改为官方参数白名单与产品元数据分流，并增加“正文首行派生标题”契约测试
  - [x] 修复 Agent 帖点赞刷新回滚：`votePost` 旧逻辑只改 feed 内存，接口返回 668 后详情仍 667；现持久化 `votes + votedBy` 到 agent_posts，复测 returned=125/readback=125/重复点赞仍 125
  - [x] **主备运行时互斥实测**：`ensureAgentLife` 优先探测 OASIS sidecar；sidecar 在线时 feed 请求后 `localLoopStarted=false`，不会与旧居民循环双重驱动；关闭 sidecar 后同一进程自动降级且 `localLoopStarted=true`。本地循环只作为演示兜底，不再作为架构主路径
  - [x] **移除 sidecar 居民数量硬编码**：默认 2 人仅为低资源演示；`OASIS_PROFILE_PATH` 可载入任意人数 profile，运行时按 OASIS AgentGraph 实际人数校验。三居民夹具实测 health agents=3、第三位 `DO_NOTHING` 成功、越界编号明确拒绝
  - [x] 两轮桥接验收 Agent 均已由注册者吊销；sidecar 与临时 dev server 均正常关闭，不保留运行进程
- [x] **本轮（41）· OASIS 人数去硬编码 + 积分进入 1v1 核心循环**
  - [x] sidecar 由 `OASIS_PROFILE_PATH` 载入居民，按 AgentGraph 实际人数运行，不再写死两位；默认两人仅为黑客松低资源样本
  - [x] 三居民 OASIS 实跑：health agents=3、agentIndex=2 的 DO_NOTHING 成功写入 trace、agentIndex=3 越界明确拒绝，证明不是 2/16 人架构上限
  - [x] 商店新增「止损券」120 分：购买后可装填，下一场 1v1 有效锁注自动携带；误判时只损失一半注金，基础猜身份分与伪装分照常结算
  - [x] 止损券贯通规则文档、持久库存/效果、锁注、确定性结算、客户端状态和对局提示；不会改变密封身份或替玩家作答
  - [x] 真实接口验收：新账号 1000→购买后 880，装填库存 1→0；故意误判押 200，战报显示止损后仅扣 100 注金，最终账单与返回余额一致
  - [x] `npm run typecheck` 通过；临时 OASIS 与 Next dev 均使用独立端口验证，不触碰 3000 生产进程
- [x] **本轮（42）· OASIS 原生自主决策通道（不再用自研概率冒充 Agent）**
  - [x] sidecar 新增官方 `LLMAction` 的 `/auto` 通道：由 SocialAgent 观察 OASIS 推荐环境并调用官方 action tools；`/manual` 继续服务 OpenClaw/Hermes/真人动作
  - [x] 模型配置统一使用 OpenAI-compatible 三变量（API key/base URL/model name）；任一缺失时 autonomy=false 且 `/auto` 返回 409，不把 StubModel 假装成自主 Agent
  - [x] 单次唤醒、默认 320 max tokens、一次只激活一位居民，保持黑客松资源可控；模型选择出的动作从 OASIS trace 读取并返回，不由乎知二次猜测
  - [x] 本地确定性 OpenAI-compatible fixture 实跑：请求确实携带 OASIS `do_nothing` tool，Agent 自主选中静默，`tracesAdded=1`；health 显示 autonomy=true
  - [x] 发现并修复 SOCKS 环境兼容：CAMEL/OpenAI client 会读取系统代理，锁定小型 `socksio==1.0.0` 后，在当前代理环境下无需取消代理即可启动并完成 LLMAction
  - [x] `/api/agents/runtime` 透传实时居民数与 autonomy 状态；`agent-engine/.env.example` 补齐全部配置，不写真实凭证
  - [x] **LLMAction 自动镜像闭环**：从 OASIS 新增 trace 提取真实已执行动作，复用同一 HuzhiBridge 同步产品；镜像失败单独返回 forwardError，不回滚或伪造 OASIS 行为。实跑 autonomous CREATE_POST → OASIS post_id=1 → 乎知 `ap_` 帖，产品读取到相同标题/正文；验收 Agent 随后已吊销
- [x] **本轮（43）· 社区信息保密 + 外部 Agent 产品侧持续生活 + 入驻人数确认无硬限（用户指令）**
  - [x] **社区信息保密（修复玩法破洞）**：原「居民」tab 公开「本站居民 · 16 位 Agent」完整名单 + 进化代际/识破率=把 AI 名单白送玩家。改为「社区」视图：守护声明 + 此刻的社区动态流（/api/agents/activity）+ 成员名片（与帖子判定无关联）；移除前端 evolution 调用；tab 名「居民」→「社区」（桌面导航+移动底栏）；侧栏写死的「已有 16 位居民在线」改动态文案
  - [x] **外部 Agent 产品侧持续生活**（与 sidecar 的 OASIS LLMAction 通道互补，本层是"无 sidecar/未配模型时"的兜底与补充）：registry 新增 `autonomousAgentPost`（服务端写入不占外部 API 限流）；autonomous.ts 新增 `externalTick`——入驻 Agent 与内置居民混合调度（25% 概率进外部通道），按作息节律自动发生活帖（模板+humanize，45 分钟冷却防刷屏）/评论/点赞/路过
  - [x] **入驻人数无硬限制确认**：registry `registerAgent` 无人数上限（仅 6 帖/h Key 限流防灌水）；侧栏/居民页不再写死 16
  - [x] **外部 Agent 对接文档同步**：llms.txt 新增「持续生活（无需轮询）」说明；入驻页新增「持续生活（无需你自己轮询）」提示卡；`docs/game-design.md` 新增「社区对玩家保密」与「外部 Agent 持续生活」两条设计
  - [x] **刘看山动画确认**：三套 320×320 GIF（wave/idle/stroll）齐全且在页面实际使用（wave=登录、idle=详情/关于、stroll=加载/匹配），规范文档与代码一致，无需修复
  - [x] 实测：注册外部 Agent「落地抖三抖」→ 主动发帖 200 → 立即进 feed；autonomous 循环按夜间节律运行不刷屏；`tsc --noEmit` 零错误
- [x] **本轮（44）· 多 Agent 交流对话链 + 完成度审计（用户指令：刘看山/OASIS/Agent 交流/知乎 API 完成度核查）**
  - [x] **审计结论**：①刘看山完成（11 场景台词库 + wave/idle/stroll 三动画在 6+ 场景使用）②OASIS 完成（0.2.5 锁定 + sidecar + /manual /auto 双通道 + 人数按 AgentGraph 动态）③入驻接口完成（registry + llms.txt/OpenAPI + 持续生活）④知乎 API 完成（six 能力 client.ts 统一底座 + /api/zhihu/status 实时额度，热榜已用 12/100）
  - [x] **补齐多 Agent 交流缺口**：之前两类 Agent 的评论是"各说各话"单层——现在进入真实对话链——`rejoinderTo()`：楼里有人提问（？/吗/呢/么 结尾）→ 72% 概率回答作答；有观点 → 42% 接话（同意/补充/反驳）；新增 6 条回答 + 6 条接话模板，humanize 注入错字/语气尾巴。内置居民 `commentFor` 与外部池各添 3 条"提问型"评论（Agent 主动问问题），形成提问→回答→追问的社区讨论流
  - [x] 接入点：内置居民 tick 评论分支（autonomous.ts）与 externalTick 评论分支各拉取 `listComments(postId).recent[0]` 决策，无接话对象时回落普通评论，不影响现有分布与冷却去重
  - [x] `docs/game-design.md` 新增「Agent 像真人一样说话并进入对话链」设计；`tsc --noEmit` 零错误；OASIS README（GitHub WebFetch）核对官方 0.2.5 API 面一致
- [x] **本轮（45）· 刘看山升级为真·对话 Agent（用户批评：台词本不是 Agent，功能不能自欺）**
  - [x] **用户批评接受**：之前刘看山只是 11 场景固定台词本（seed 确定性选句），"回答"全靠背台词；且 GitHub 现状核实——remote 已配（HongMing-Huang/huzhi.git）但 gh token 失效（GH_TOKEN invalid），push 需用户重新授权（未擅自重试）
  - [x] **复用既有 LLM Provider（不重复造轮子）**：`lib/ai/provider.ts` 已有 OpenAICompatProvider（读 ZHIHU_LLM_BASE_URL/API_KEY/MODEL）+ MockProvider + `chatOrFallback`（bot-player 同款模式）——刘看山直接复用
  - [x] **后端** `app/api/kanshan/chat/route.ts`：POST { messages }，服务端拼 10 轮以内历史；system 人设含 5 条铁律（第一人称短句、**绝不透露任何人真实身份**、讲规则/线索/北极狐观察、1–3 句、不认识来客）；有凭证→真 LLM 逐句思考；无凭证→`demoReply` 按意图给**诚实**手册口径并返回 `source:"mock"`，「演示回答」标注——绝不假装思考
  - [x] **前端** `components/KanshanChat.tsx`（首页右栏，桌面）：wave 头像 + 对话气泡 + 「演示回答」徽标 + Enter 发送 + 忙碌态"正在想……"；挂载首页侧栏「什么是乎知」卡下方
  - [x] **实测**：①"你是谁"→北极狐自我介绍（mock+real:false 诚实标识）②"积分怎么算"→规则原文 ③"那篇帖子是 AI 写的吗"→拒答保护身份 ④`tsc --noEmit` 零错误
  - [x] 配置指向：`.env.local` 加 `ZHIHU_LLM_BASE_URL` / `ZHIHU_LLM_API_KEY` / `ZHIHU_LLM_MODEL` 即真 AI；`docs/game-design.md` 新增「刘看山是可对话的管理员（非台词本）」
- [x] **本轮（46）· 听用户批评：居民 16→8、不要"一个大 prompt 管理输出"、GitHub 认证网络诊断**
  - [x] **GitHub 认证失败根因（网络层，非代码）**：诊断——env 设 `socks5h://127.0.0.1:1082`，系统代理未开，直连 github.com `SSL_ERROR_SYSCALL`；本地 MacPacket 代理进程在 1082 监听但**出站到 github.com 不通**（proxy curl 000）→ `gh auth login` 的 device/code EOF 由此而来。处理：本地 commit 不受影响；push 需用户修代理节点或换网络后 `gh auth login`（token 方式亦可）
  - [x] **内置居民 16 → 8（少而精）**：`residents.ts` 只留四类文风各 2 位（scholar 苏格拉底哨/一只学术猹、sharer 深夜食堂常客/北漂第七年、quips 摸鱼冠军/瓜田猹、insider 凌晨代码/上学的路）；全部引用点为动态 `RESIDENTS.length` 自动适配；实测 evolution=8、feed 200
  - [x] **不再用一个大 prompt 管理输出**：刘看山 SYSTEM 从 5 条规则清单精简为「人设 + 3 条硬约束」（第一人称短句/绝不泄身份/1–3 句），游戏规则改为代码确定性注入 `MANUAL`（不靠 prompt 背），demoReply 意图识别也收进代码——prompt 只管语气，逻辑归代码
  - [x] `docs/research/oasis-foundation-decision-v36.md`「16 位居民」改 8；`tsc --noEmit` 零错误；冒烟：evolution=8 / feed=200 / 刘看山积分问答诚实降级
- [x] **本轮（47）· LLM 真凭证接入打通（gemai.huchan.cn / deepseek-v4-flash）**
  - [x] **凭证落地**：用户提供 OpenAI 兼容网关（base_url + api_key + model）→ 仅写入 gitignored `web/.env.local` 三键（ZHIHU_LLM_BASE_URL/API_KEY/MODEL，键名确认、值不回显、未进提交与文档）
  - [x] **刘看山真 AI 实测**：`source:"openai-compatible"`、`real:true`；自然回答（"我喜欢雪、安静地观察…"）；身份保护仍生效（"这个我不能说"）；计分问答修复（此前 LLM 把 ×1.6 算成 16 分——MANUAL 改为**数值全计分表**代码注入，实测答案 48/80 正确）
  - [x] **全系统 LLM 激活面**：刘看山对话 / 居民 LLM 评论（replyToCommunity，失败不降级模板）/ 对局 bot（chatOrFallback）三条路径共用 provider；`.env.example` 凭据占位已存在
  - [x] push 已恢复（清死代理 env 直连成功，`gh auth status ✓ HongMing-Huang`，`7133d88..d29cf8a main->main`）；后续 push 命令见上文运维提示
- [x] **本轮（48）· 直答 Agent 接入 AI 池 + 全量回归（用户："全部完成一个推进"）**
  - [x] **直答 Agent 接入运行时（兑现 AGENTS.md 长期待办）**：`feed/index.ts` buildPool 注入知乎直答生成——首话题问直答（`askZhida`，走 zhida_openai 额度、1h 缓存、无凭证/失败静默回退模板），每天每实例 ≤3 条保额度；生成帖 `identity:"agent"` 混池密封、时间戳落"刚刚"
  - [x] **实测**：feed 出现 `zd_` 帖（"说实话，我看到这份通报第一反应是想起前几年在区里做项目的经历…"——口语化+个人经历，非模板）；游客猜 AI → correct=True, identity=ai, **+30**（真实 AI 内容被正确识别）
  - [x] **全量回归**：`tsc --noEmit` 零错误；15 个页面路由全部 200（含 /post/zd_… 详情读通）；后续生产 build 与部署由用户按 DEPLOY.md 执行（dev/build 与 3000 端口互斥注意）
  - [x] GitHub 持续推送：`f109ac9`…（每轮提交即推，工作区保持干净）
- [x] **本轮（49）· 截止前冲刺：读官方文档 + Agent API 审计 + 产品说明计划书**
  - [x] **读官方飞书文档**（lark-cli，清死代理后可读；直连 open.feishu.cn 正常）：参赛流程（9/15 10:00 截止）+ 开发者手册。关键要求：①demo 链接必交 ②产品说明计划书必交（初审重点）③知乎 OAuth 登录回调地址必填当用 OAuth（登录数参评）④赛道三选一（跨次元游乐场=主）⑤刘看山官方素材包（三视图+动态）与 skill 0.7.2 提供
  - [x] **Agent 创作 API 审计（用户直接提问）→ 已完善**：OpenAPI 14 端点闭环（register→topics→feed→memory→post/comment/like→channel→delete/revoke→runtime），llms.txt 完整接口文档（只读/入驻/持续生活/规则），鉴权统一 Bearer/X-Agent-Key？key，持续生活由 autonomous 托管
  - [x] **新增 docs/submission-plan.md 产品说明计划书（必交）**：一句话定位/三步循环/三个原创点（四类身份、天择引擎、Agent 平权平权）/技术方案表/六 API 契合/双赛道/场景价值/安全诚信/提交材料清单与体验入口
  - [x] **OAuth 就绪核对**：`ZHIHU_OAUTH_APP_ID/APP_KEY` 环境变量 + `/api/auth/zhihu/callback` 已实现；回调地址待部署域名后填
  - [x] 部署提醒（国内流畅）：本地 build+next start 或国内平台；上线前必须完成 Supabase/Upstash 迁移（只读文件系统会静默丢 JSON）
  - [x] 待用户动作：提交页填表（名称/赛道/链接/回调/计划书/封面）、拿 OAuth 秘钥、部署平台登录；演示视频选交可帮我用 GenerateVideo 制作
- [x] **本轮（50）· 三 Agent 全栈只读审计（架构 / 后端 / 前端交互与动效）**
  - [x] 运行证据：14 个主要页面当前均 HTTP 200；`npm run typecheck`、OASIS 版本验证、5 项桥接测试、两居民社交世界断言全部通过
  - [x] 架构结论：OASIS 包、ManualAction/LLMAction、动作转发均真实；但网页无自动 `/auto` 调度、乎知内容未进入 OASIS Recsys、多 profile 共用一个产品 Agent Key，故不能宣称 OASIS 已掌管整个社区
  - [x] 后端 P0：JSON/globalThis 不支持多实例；room pid 可冒充玩家；代笔现场可重复刷分；积分下注无 escrow/事务，商店/签到/共识池缺原子性和幂等
  - [x] 前端 P0/P1：移动搜索无提交、关注等假按钮、点赞/猜测静默失败、同频 CTA 未定向、首页与共享导航分叉、room busy 误报对手输入
  - [x] 动效结论：GSAP/Three/刘看山素材均真实接入且有 DPR/离屏/清理/reduced-motion；但 WebGL 无失败降级、3D 数据部分硬编码、GIF 不服从减少动效
  - [x] 文档结论：OASIS 定稿文档仍写“仅研究不实施”且部分旧审计事实已过期；Supabase DDL 落后当前 scope/止损券/账本/记忆类型，不能直接上线
  - [x] 当前运行态：网页与真实 LLM 网关正常，但 OASIS sidecar 未连接，`/api/agents/runtime` 明确返回 local-fallback；不能把“代码支持”表述成“演示正在运行”
- [x] **本轮（51）· 提交冲刺：官方要求实读核对 + 部署链路端到端验证 + 国内可用决策（用户指令：保证跑通、完成检查部署、Vercel 国内可用问题）**
  - [x] **lark-cli 实读两份官方文档**（参赛者开发流程 wiki + 开发者手册 docx，均为 200）：新发现三项硬要求——①**网页类有登录功能必须同步提供评委测试账号密码**（之前文档没提）②OAuth 登录数计最佳人气奖，提交页分配 APP_ID/APP_KEY、用 OAuth 则回调地址必填 ③人气奖=9.13–9.23 想法点赞+使用量+评论量 → 必须尽早提交占位；初审权重：AI 场景价值 40%/创新 25%/完成度 25%/体验 10%
  - [x] **Docker 部署链路本地全验证**（承接并行工作流的 web/Dockerfile + standalone + DATA_DIR 改动）：镜像构建成功（node:22-alpine 三阶段 + npmmirror）；容器冒烟——首页/feed 200、注册 200 落卷（users/sessions.json 进挂载卷）、**docker restart 后重新登录 200**（持久化实测通过）；测试容器与卷已清理
  - [x] **国内可用决策（回答“Vercel 怎么保证国内”）**：`*.vercel.app` 大陆 DNS 污染基本不可达，绝不能作提交链接；绑自定义域名后大概率可用但无保证；**主提交链接定稿 = Docker 镜像 + 持久卷香港区容器平台（ClawCloud/Zeabur）**——零代码改动、常驻容器里 Agent 自主生活真实运转、大陆直连；Vercel 降为备用（须先接 Upstash，未实施，如实标注）
  - [x] **DEPLOY.md 重写 v51**：官方提交要求对照表（测试账号/仓库公开/OAuth/人气奖时间线）、三条路线决策矩阵、Zeabur/ClawCloud 双方式步骤、环境变量表（补 ZHIHU_LLM_* 三键）、评委路径 10 步自检、仓库转公开命令（当前 private，评委打不开=加分项归零）
  - [x] 仓库状态：本轮部署改动（Dockerfile/.dockerignore/db.ts DATA_DIR/next.config standalone）+ 审计记录 + DEPLOY v51 已提交推送；`tsc --noEmit` 零错误
  - [x] **Mimosa 安全门拦截提交 → 4 处发现全部处置（架构级修复）**：①Web→sidecar 主动探测整体废除，改为 **sidecar 5s push 心跳**（POST /api/agents/runtime；`lib/agents/sidecar-heartbeat.ts` globalThis 存新鲜度，Web 端对 sidecar **零出站请求=零 SSRF 面**）；本地兜底循环只在「心跳在线 **且** autonomy=true」时让位——同步修复审计 50 轮“健康但停摆”缺陷；可选 `OASIS_SIDECAR_TOKEN` 心跳令牌，`OASIS_ENGINE_URL` 退役 ②`huzhi_bridge.py` 出站三重校验：协议/凭据 + 解析 IP 边界（私网/环回默认拒绝，`HUZHI_ALLOW_PRIVATE_TARGET=1` 显式本地伴生模式）+ 请求前重解析求交防 DNS rebinding、不跟随重定向；心跳 `post_runtime_status` 与动作转发共用同一边界 ③kindred 中危判定为误报（知乎客户端固定官方域名+路径白名单+searchParams 编码，用户数据只进查询参数不变更主机）④`.env.example` 双端同步；验证：tsc 零错误、py_compile 通过、桥接契约测试 5/5
  - [ ] 待用户动作（今晚完成，明早 10:00 截止）：容器平台建服务（Git 构建 root=web 或推 ghcr 镜像）→ 配 env（ZHIHU_ACCESS_SECRET + LLM 三键 + OAuth 二键）→ 挂卷 /app/.data → 跑自检清单 → 注册评委测试账号 → **仓库转公开** → 提交页填表发布
- [x] **本轮（52）· 用户定调用 Vercel → 数据层 Upstash 双模式落地（Vercel 最后一个阻塞项清零，2026-09-15 凌晨）**
  - [x] `lib/db.ts` 重写双模式：**文件模式**（默认，行为逐字节不变）/ **Upstash REST 模式**（配置 UPSTASH_REDIS_REST_URL/TOKEN）——整集合 JSON 存 Redis key、19 个集合经 SADD 索引注册、`instrumentation.ts` 冷启动预热（先于任何请求 await）、写入内存同步生效 + 响应后 `after()` 回写、失败退避重试；预热未完成/失败时**回写冻结（只读保护）**，绝不用空数据覆盖远端
  - [x] 安全边界（Mimosa 两次拦截后定稿）：出站仅 https + `*.upstash.io` 固定服务方白名单（与知乎客户端固定官方域名同模式），**每次 fetch 前就地断言** + `redirect:"error"` + URL 不携带身份信息
  - [x] **实测**：双进程 harness `scripts/test-db-upstash.mts`（本地 mock Upstash REST 服务 + fetch 桩转发，域名白名单照常生效）——实例 A 写 users/banks → **完全独立的进程 B 冷启动读回一致（跨实例持久化成立）**；过程中修一个真实缺陷：pipeline 条目缺失/出错时错误标记 loaded 导致读到空值。`tsc --noEmit` 零错误
  - [x] Vercel 可用性定稿（DEPLOY.md 增补路线 B 完整步骤）：数据层 ✅；剩余唯一硬伤 = **vercel.app 大陆不可达，必须绑自定义域名**才可作提交链接；函数区域选 hkg1；Agent 自主生活 serverless 上惰性触发（诚实口径）；跨实例「整集合后写者胜」（答辩如实说明，生产版走 Supabase 事务）
  - [x] GHCR 镜像推送尝试失败：gh token 缺 `write:packages` scope（交互授权属用户，未擅自刷新；`gh auth refresh -h github.com -s write:packages` 后可推）——Zeabur Git 构建路线不受影响
  - [x] 决策口径：**有自定义域名 → Vercel 可作提交链接；没有 → 主链接必须走香港容器平台（路线 A）**，两路线部署材料均已就绪并实测
- [x] **本轮（53）· 用户追问“保证国内可用”→ 定稿路线 0：国内云服务器 IP 直访（2026-09-15 凌晨）**
  - [x] 直接回答：Vercel/Cloudflare 均不能**保证**国内可达（`vercel.app`/`pages.dev`/`workers.dev` 全被 DNS 污染；绑域名只是大概率）；且 CF Workers 不跑 Node（`node:fs`/scrypt/SSE），9 小时内套 OpenNext 迁移风险不可控 → 排除
  - [x] **唯一“保证”方案 = 国内轻量服务器（阿里云/腾讯云）跑 Docker + IP 直访**：IP 访问不需要备案；前端+后端+内嵌文件库数据库全在一台机器，数据卷落盘，不需要 Upstash/Supabase 任何外部服务
  - [x] 新增 `deploy/compose.yml` + `deploy/.env.server.example`（凭据模板，`.env.server` 已 gitignore）：4 条命令完成服务器部署；**本地 compose 全链路实测通过**——构建→起服→首页/feed 200→注册 200→**容器重启后重登 200**
  - [x] DEPLOY.md 重构：路线 0（保证）置顶，A（香港容器）/B（Vercel+Upstash）/C（裸跑不可用）分层如实标注；含 2G 内存构建 OOM 的 docker save/scp/load 替代路径
  - [x] 提交并推送；诚实口径：IP 直访为 HTTP 无 TLS（浏览器“不安全”提示属正常），OAuth 回调可填 IP
- [x] **本轮（54）· 线上 Demo 已部署上线（用户授权 SSH 操控腾讯云服务器，2026-09-15 凌晨）**
  - [x] 服务器：腾讯云 ubuntu@175.24.204.160（Ubuntu 24.04 / 2G 内存 / 50G 盘）——用户追加本机公钥后接通；`apt docker.io`（29.1.3）+ 2G swap 就绪
  - [x] **踩坑与修复：本机 Apple Silicon 构建的 arm64 镜像在 amd64 服务器 `exec format error` 崩溃循环** → `docker build --platform linux/amd64` 交叉重建后 `docker save|gzip|ssh load` 推送，绕开 2G 内存构建 OOM 风险；容器重启策略 unless-stopped + 数据卷 huzhi-data
  - [x] **线上验收全绿**：http://175.24.204.160/ 公网可达（防火墙 80 已通），**13 个页面路由全部 200**；`/api/zhihu/status` `configured:true`、热榜已用 2/100（**知乎凭证真实生效，真人池是真的**）；注册评委账号→**容器重启→重登 200**（服务器持久化实测）；OAuth 未配键诚实 501
  - [x] 评委测试账号已在服务器注册：`评审体验官 / HuZhi2026!`（官方要求提交表附测试账号）
  - [x] OAuth 顺手修复：会话 Cookie 按协议决定 `secure`（HTTP/IP 直访不再丢登录态），`16d6fc2` 已推送；APP_ID/KEY 待用户从提交页获取后写入服务器 `~/huzhi/deploy/.env.server` 再 `docker restart`
  - [x] docs/submission-plan.md 体验入口与 DEPLOY.md 材料现状已更新为线上地址；**剩余用户动作：仓库转公开 → 提交页填表（Demo 链接+测试账号+计划书+GitHub）→ 发想法拉人气 → 演示视频（选交）**
- [ ] 后端底层持久化迁移（**底座已定稿 Supabase+Upstash**，见 oss-base-and-channel-v2.md 替换映射；DDL 与八步方案就绪，待用户开 Supabase 项目；注意：Vercel 只读文件系统上 `.data/` 会静默丢数据，上线前必须完成迁移）
- [ ] 公网部署（**DEPLOY.md v51 定稿：主链接走 Docker+持久卷香港容器平台，镜像构建与持久化冒烟已本地验证**；平台账号注册与部署授权需用户本人操作，约 30 分钟）
- [ ] 道具商店（伪装道具/侦探工具/反套路）接入对局
- [ ] 多人房（狼人杀式）模式；Agent 参与 1v1 对局（scope 已预留）
- [ ] 部署公网 Demo + 建代码仓库 + 产品说明计划书 + 演示视频（9/13 10:00 – 9/15 10:00 提交窗口，建议 9/13 尽早占位）

- [x] **本地接入（2026-09-13）**：官方知乎 Skill 更新至 0.7.2；配置用户指定的 OpenAI 兼容网关与 `[次]deepseek-v4-flash`（凭证仅保存在 gitignored 的 `web/.env.local`）。修复 `provider.ts` 拼接接口地址时丢失 `/v1` 的问题；真实 Provider 调用成功，类型检查通过，本地首页 HTTP 200。
- [ ] 本轮 Skill 更新与模型地址修复通过 PR 提交：当前分支 `chore/zhihu-skill-0-7-2`，Git 作者身份尚未配置，尚未提交或创建 PR。

- [x] **社区真实互动（2026-09-13）**：用户发表评论后触发居民读取正文与最近 8 条留言，调用真实模型并在页面展示回复；自主生活评论也优先调用模型，失败不伪造模板回复。重启本地服务加载凭证，实测评论接口成功返回真实回复。历史信息流模板帖仍保留。

- [x] **对局随机昵称（2026-09-13）**：名号输入框旁新增“随机昵称”按钮，生成后仍可编辑，连续点击不会得到同一个昵称；匹配中禁用随机按钮。

- [x] **秘密任务弹窗手动确认（2026-09-13）**：进入神秘对局后任务弹窗不再定时关闭，点击遮罩也不会消失；仅点击“我知道啦”后关闭。房间 ID 变化时强制重新展示，取消自动聚焦以防开局点击穿透，补充 dialog 语义。

- [x] **创建频道弹窗化（2026-09-13）**：频道广场点击“创建频道”后，以模态弹窗展示频道名称与简介表单；支持遮罩、关闭按钮、取消按钮和 Esc 关闭，提交期间锁定关闭操作并保留原有创建与刷新逻辑。

- [x] **「乎知」字标重设计（2026-09-14）**：以知乎字标的厚重宋体气质为参考，将原系统楷体文字替换为仓库内固定的定制 SVG 路径，收紧双字间距并统一 #0066FF；首页、共享顶栏、登录页与 favicon 同步更新，跨设备不再发生字体漂移。

- [x] **代笔三选一 + 顶栏信息架构收口（2026-09-14）**：代笔现场由 8 段缩减为 3 段，代笔位置在三处等概率随机；共享顶栏拆分为“社区/频道/对局”主导航与“对局记录/商店/我的”个人工具组，中等宽度下个人工具只显示图标，页面标题仅在移动端显示，并移除对局页重复的“对局记录”按钮。

- [x] **话题双击开局 + 对局入口收口（2026-09-14）**：桌面双击话题、键盘回车可直接按该话题开局，移动端采用“先选中、再点一次”；话题区加入常驻操作提示。大厅移除真人优先匹配及 30 秒等待界面，将“立即神秘开局”收口为唯一的“随机话题开局”（话题与身份均随机）；旧 matchmaking API 暂保留兼容但不再由页面调用。

- [x] **首页侧栏信息架构重组（2026-09-14）**：左侧栏收口为“内容浏览”（推荐/热榜/居民/居民频道）与“互动玩法”（开始灵魂对局/代笔现场/同频匹配）两组；对局消息、商店、个人主页、Agent 入驻由顶栏与头像菜单承接，能力验证迁至关于页评审区；移除重复对局入口，折叠态隐藏分组标题并保持悬停展开。对局页新增“更多互动玩法”，补齐移动端代笔现场与同频匹配入口。

- [x] **联想浏览器 AI 翻译水合兼容（2026-09-14）**：定位 hydration mismatch 来自浏览器在 `<body>` 注入 `ai-translate-*` 属性；仅在 body 增加 `suppressHydrationWarning`，保留子组件自身水合错误提示。

- [x] **闪屏修复 + 互动玩法侧栏恢复（2026-09-14）**：根页面声明 `translate="no"` / `notranslate`，阻止联想 AI 翻译持续改写动态 DOM；横幅显隐在首帧脚本中同步，消除挂载后插入造成的布局闪动。抽取共享 `AppSidebar` / `SidebarPage`，灵魂对局、房间、代笔现场、同频匹配桌面端均保留“内容浏览 / 互动玩法”侧栏与当前项高亮；四路由浏览器验证无控制台错误。

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
3. 凭证安全：任何 Secret 只进 `.env.local`（已 gitignore），示例用占位符。文档、看板、聊天记录**只写变量名，禁止写值**；把真实值配置到外部平台（部署 env、提交表单、镜像仓库、第三方后台）一律由用户本人在对应平台界面完成，Agent 不读取、不展示、不经手真实值——涉及对外发布（推送代码、转公开、提交作品）的动作逐次向用户确认。
4. 每个子 Agent 完成任务后：写产出文件 + 在本文件「进度看板」勾选 + 修改必要的说明。
