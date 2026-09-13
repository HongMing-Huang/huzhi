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
- [ ] 后端底层持久化迁移（**底座已定稿 Supabase+Upstash**，见 oss-base-and-channel-v2.md 替换映射；DDL 与八步方案就绪，待用户开 Supabase 项目）
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
