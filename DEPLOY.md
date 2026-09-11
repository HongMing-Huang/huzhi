# 乎知 · 公网部署指南

> 目标：评委可公网访问的在线 Demo（提交必交项）。当前技术栈 Next.js 15，最优路径是 Vercel（一分钟部署）。

## 方案 A：Vercel（推荐，免费档可跑）

### 步骤

```bash
cd web
npx vercel login        # 用浏览器登录你的账号（需要你本人操作一次）
npx vercel --prod       # 首次会询问项目名，直接回车即可
```

### 必配环境变量（Vercel 控制台 → Settings → Environment Variables）

| 变量 | 值 | 说明 |
|---|---|---|
| `ZHIHU_ACCESS_SECRET` | 你的 Access Secret | 热榜/搜索真人池（务必配置，否则降级为演示话题库） |
| `ZHIHU_OAUTH_APP_ID` / `ZHIHU_OAUTH_APP_KEY` | 活动页创建项目后获得 | 知乎登录（人气奖指标） |
| `ZHIHU_LLM_BASE_URL` / `ZHIHU_LLM_API_KEY` / `ZHIHU_LLM_MODEL` | 可选 | 接入真 LLM 生成 Agent 内容 |

也可用 CLI 配置：`npx vercel env add ZHIHU_ACCESS_SECRET production`

### 部署前检查清单（比赛硬性要求）

- [ ] Demo 公网可打开、核心流程可操作（信息流 → 猜身份 → 对局 → 登录 → Agent 入驻）
- [ ] 接口失败/降级有真实提示（已内置：演示话题库/本地语料自动降级）
- [ ] 凭证只存在 Vercel 环境变量，**不在代码仓库/截图/视频里出现**
- [ ] 使用知乎 OAuth 时，回调地址（`https://你的域名/api/auth/zhihu/callback`）与活动页登记值完全一致
- [ ] 有登录功能需提供测试账号密码（评委体验用）

## 已知限制（当前版本）

- **游戏/会话数据存进程内存**：Vercel serverless 多实例间不共享，且重启即清空。公网演示期可接受（猜帖积分、对局都能玩，只是刷新后对局房间会重建）；按 `docs/research/backend-architecture-research.md` 的 8 步迁移到 Supabase/Upstash 后彻底解决。
- 知乎热榜 100 次/天、直答 100 次/天：服务端已有缓存与并发去重，评委体验足够；如预期流量大，到开放平台申请提额。

## 方案 B：Zeabur / Railway（备选）

长连接友好的容器平台，适合后续上 Supabase Realtime 后的自托管阶段：

```bash
# 以 Railway 为例
npm i -g @railway/cli
railway login && railway init && railway up
```

环境变量同上，启动命令 `npm run build && npm run start`。

## 自定义域名

Vercel → Settings → Domains → 添加域名并按提示配置 DNS CNAME。活动页提交 Demo 链接时使用正式域名。
