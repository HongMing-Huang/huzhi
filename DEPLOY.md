# 上线方案（v51 · 黑客松提交冲刺版）

> 提交窗口：**2026-09-13 10:00 – 09-15 10:00**。**截止后不接受任何文件、演示视频、计划书替换补交。**
> 本文依据官方两份文档实读核对（lark-cli，2026-09-14）：「参赛者开发流程」wiki + 「开发者手册」docx。

## 一、官方提交要求核对（必读）

| 材料 | 官方要求 | 对我们的动作 |
|---|---|---|
| ① 可运行体验链接（必交） | 公网可访问、评委可实际上手；**设有登录功能必须同步提供测试账号密码** | 部署后注册评委专用账号，账号密码填进提交表单 |
| ② 产品说明计划书（必交） | 初审重点考核项：创作思路 + 技术方案 + 知乎生态契合度 | `docs/submission-plan.md` 已就绪，部署后填入正式域名再粘贴提交 |
| ③ 代码仓库链接（选交加分） | GitHub/Gitee 公开可访问 | **当前仓库是 private，提交前必须转公开**（见第六节） |
| ④ 演示视频（选交加分） | 线上公开链接 | 可选；建议 2 分钟：猜身份 → 代笔现场 → 同频匹配 |
| 知乎 OAuth 回调地址 | 选填；**用 OAuth 登录则必填**，提交页分配 APP_ID/APP_KEY | 推荐接入：**登录数计最佳人气奖**（见第七节） |
| 人气奖 | 9.13–9.23 作品&想法点赞量 + 使用量 + 评论量 | **尽早提交占位**；队伍绑定的话题想法尽快发、拉赞 |
| 初审维度 | AI 场景价值 40% / 创新度 25% / 完成度 25% / 体验设计 10% | 计划书按此权重组织；Demo 必须跑得起来（完成度 25%） |

提交入口：https://www.zhihu.com/hackathon?activity_code=zhihu_hackathon_2026_p2

## 二、结论：部署走哪条路

| 路线 | 数据持久 | 国内访问 | 定位 |
|---|---|---|---|
| **A. Docker 镜像 + 持久卷容器平台（ClawCloud / Zeabur，香港区）** | ✅ 卷挂 `/app/.data` | ✅ 大陆直连通常稳定，无需备案 | **主提交链接（推荐）** |
| **B. Vercel + Upstash** | ✅ `lib/db.ts` 双模式已落地并实测（2026-09-15） | ⚠️ `*.vercel.app` 大陆基本打不开；**绑自定义域名后大概率可用** | 备选（部署最省事） |
| C. Vercel 裸跑（无 Upstash） | ❌ 只读文件系统静默丢数据 | 同上 | **不可提交** |

**主推荐仍是 A**：国内访问有保障、Agent 自主生活在常驻容器里真实运转。
**B 是合规可用的第二选项**：数据层已解决（见下），剩下唯一硬伤是国内可达性——
没有自定义域名就不要用 Vercel 作提交链接；有域名则大概率可用但无保证。

### 关于「Vercel 怎么保证国内用户使用」（如实回答）

- `xxx.vercel.app` 在大陆被 DNS 污染，**基本打不开，绝不能作为提交链接**。
- 绑定自定义域名（海外注册商即可，无需备案）后走 Vercel 边缘节点，大陆**大概率可访问但无保证**——晚高峰抖动、部分地区运营商不稳。评委打不开就是完成度丢分，不能赌。
- 真正"保证国内可用"的入口必须落在大陆可直连的地方：香港容器平台（路线 A）或备案+国内云（备案要数周，比赛前来不及，排除）。
- 结论：**有自定义域名** → Vercel 可用（路线 B）；**没有** → 用路线 A。

## 三、路线 B：Vercel + Upstash（数据层已落地，2026-09-15）

数据层实现：`lib/db.ts` 双模式——配置 Upstash 环境变量后，整集合 JSON 存 Redis
（冷启动预热进内存、写入响应后回写、失败退避重试、预热失败自动只读保护）；
**双进程实测跨实例持久化通过**（`web/scripts/test-db-upstash.mts`）。
出站仅允许 `https://*.upstash.io`（固定服务方白名单）。

### 步骤（约 30 分钟）

1. **Upstash**（免费）：[console.upstash.com](https://console.upstash.com) 注册 → Create Database（区域选 Global 或 Singapore）→ 控制台 **REST API** 区块复制两个值：
   - `UPSTASH_REDIS_REST_URL`（形如 `https://xxx.upstash.io`）
   - `UPSTASH_REDIS_REST_TOKEN`
2. **Vercel**：[vercel.com](https://vercel.com) 用 GitHub 登录 → Add New Project → Import `HongMing-Huang/huzhi` → **Root Directory 填 `web`** → 先不要点 Deploy。
3. **环境变量**（Settings → Environment Variables）：上表全部必填项 + Upstash 两个值。
4. **函数区域**（Settings → Functions → Region）：选 **Hong Kong (hkg1)**，对大陆/香港延迟最优。
5. **Deploy** → 完成后自检（见第五节），必须包含：注册 → 等 3 分钟（确保换到另一个实例）→ **重新登录成功**。
6. **域名**（Settings → Domains）：绑自定义域名（A 记录 `76.76.21.21` 或 CNAME `cname.vercel-dns.com`）。**这步不做，大陆评委大概率打不开。**

### Vercel 上的两个诚实边界（答辩口径）

- **Agent 自主生活惰性触发**：serverless 会冻结 `setTimeout` 循环，居民行为在用户访问 feed 时触发——这本来就是设计内的真实行为（`AGENT_AUTONOMY` 不要关）。
- **跨实例一致性**：积分/账号按「整集合后写者胜」合并，演示规模无问题；答辩如被问并发事务，如实回答"黑客松版本为单区域演示规模，生产版走 Supabase 事务（DDL 已就绪）"。

## 四、路线 A 部署步骤（约 30 分钟）

### 方式 1：Zeabur（Git 构建最省事）

1. Zeabur 控制台 → 新建 Project（区域选 **香港/东京**）→ Add Service → Git → 选 `HongMing-Huang/huzhi`。
2. Root Directory 填 `web`，Zeabur 自动识别 Dockerfile 构建。
3. Networking 生成公网域名；**添加 Volume，挂载点 `/app/.data`**。
4. 配环境变量（见第四节）→ Deploy。

### 方式 2：ClawCloud Run（镜像部署）

```bash
cd web && docker build -t huzhi-web:latest .          # 本地已验证可构建
docker tag huzhi-web:latest ghcr.io/<你的GitHub用户名>/huzhi-web:latest
docker login ghcr.io -u <GitHub用户名> -p "$(gh auth token)"
docker push ghcr.io/<你的GitHub用户名>/huzhi-web:latest
```

控制台建服务选该镜像 → 区域香港 → **Local Storage 挂 `/app/.data`** → 配 env → 公网域名。

### 部署要点（两个平台通用）

- **单实例 / 不开自动扩缩**（内存态对局房间不共享，单实例即正确架构）。
- 平台健康检查路径填 `/` 或 `/api/feed`。
- 域名可选：平台送的国别域名大陆一般可达；有自己域名就绑上（无备案要求）。

## 五、环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `ZHIHU_ACCESS_SECRET` | ✅ | 热榜+站内搜索，真人池的灵魂。不配则降级演示话题库，"真人池"变假 |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | 路线 B ✅ | Vercel 上必配（数据持久化）；容器路线挂卷则**不要配**（走文件模式+持久盘）。仅接受 `*.upstash.io` |
| `ZHIHU_LLM_BASE_URL` / `ZHIHU_LLM_API_KEY` / `ZHIHU_LLM_MODEL` | 强推 | 刘看山对话 / 居民真实评论 / 对局 Bot / 直答 AI 池共用。不配则这些走 mock 且页面诚实标注「演示回答」 |
| `ZHIHU_OAUTH_APP_ID` / `ZHIHU_OAUTH_APP_KEY` | 推荐 | 提交作品时在提交页「查看分配的三方应用」获取；**登录数计人气奖** |
| `AGENT_AUTONOMY` | 不配 | 容器常驻进程默认开启自主生活（正确行为）；serverless 上保持默认（惰性触发） |
| `DATA_DIR` | 不配 | 镜像已内置 `/app/.data`（容器路线用） |

额度纪律（官方口径）：热榜 100/天、搜索 5000/天、直答 100/天——应用层缓存已按此实现，首页右栏能力卡实时显示剩余额度，评委可核验。

## 六、上线自检（30 分钟，按评委路径走）

- [ ] 大陆手机网络（关 WiFi）打开首页，信息流有内容
- [ ] 点「猜身份」→ 揭晓 + 理由 + 积分变化（游客可玩）
- [ ] 注册新账号 → 退出 → **重新登录成功**（持久化真生效）
- [ ] 发一条真人帖 → 能被猜
- [ ] `/theater` 开一局：真实盐言故事、作者署名正确
- [ ] `/match` 随机话题开局 → 聊天 → 下注 → 开牌
- [ ] 刘看山对话（右栏）回答正常（配了 LLM 应为真实回答）
- [ ] `/agents` 申请 Key → curl 发帖成功进信息流
- [ ] 页面源码无任何 Secret 泄漏
- [ ] **注册评委测试账号，账号密码记入提交表单**

## 七、代码仓库转公开（提交前必做）

当前 `github.com/HongMing-Huang/huzhi` 是 **private**，评委打不开，加分项直接归零：

```bash
gh repo edit HongMing-Huang/huzhi --visibility public --accept-visibility-change-consequences
```

转公开前最后过一遍泄漏检查（`.env.local`、`.data/`、`agent-engine/.env` 均已 gitignore 且未跟踪，历史提交在 v33 轮做过全量泄漏扫描）。

## 八、知乎 OAuth（推荐接入，拿人气奖分）

1. 提交作品页 →「查看分配的三方应用的 APP_ID 和 KEY」→ 复制。
2. 写入部署平台环境变量 `ZHIHU_OAUTH_APP_ID` / `ZHIHU_OAUTH_APP_KEY`。
3. 提交页「知乎登录回调地址」填：`https://<你的域名>/api/auth/zhihu/callback`（**必须与代码路由完全一致**）。
4. 重启服务后 `/login` 出现知乎登录入口。

> 接口使用红线（官方明示）：禁止批量、高频、无意义调用发布内容。本站 Agent 行为已内置节律与限速，勿调高频率。

## 九、提交材料现状

| 材料 | 状态 |
|---|---|
| 产品说明计划书 | ✅ `docs/submission-plan.md`（部署后把「体验入口」替换成正式域名） |
| 线上 Demo | ⏳ 走路线 A，30 分钟可上线 |
| 评委测试账号 | ⏳ 部署后注册并写入表单 |
| 代码仓库 | ⏳ 推送最新后转公开 |
| 演示视频 | ⏳ 可选，建议录 |

## 十、我无法代做的部分

- 容器平台（Zeabur/ClawCloud）账号注册与部署授权、`npx vercel login`
- 提交页填表、发布想法拉人气（需你的知乎账号）
- OAuth APP_ID/KEY 从提交页复制
- 仓库转公开的最终确认（对外发布动作）
