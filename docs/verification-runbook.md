# 检验流程手册（Verification Runbook）

> 目的：把「乎知」的验收固化为可重复执行的五步流程。每一步都有明确命令与判定标准，
> 全部通过才算本轮可交付。本轮（2026-09-13）已按此流程实跑，记录见文末。
> API 结构依据：[docs/zhihu-api-integration.md](zhihu-api-integration.md)。

## 流程总览

| 步骤 | 检什么 | 命令 | 通过标准 |
|---|---|---|---|
| 1 | 类型与构建 | `npm run typecheck` + `npm run build` | 零错误，路由表完整 |
| 2 | 六接口直连 | `npm run verify:zhihu` | 8 过 0 败，额度各消耗 1 |
| 3 | 运行时接口 | dev server + curl 清单（下文） | 每端点 200 且形状正确 |
| 4 | 界面走查 | 浏览器逐页 | 能力卡/降级提示/移动端达标 |
| 5 | 降级检验 | 摘除凭证复跑 3/4 | 人话提示，无英文错误串泄漏 |

以下命令除注明外均在 `web/` 目录执行。

---

## 第 1 步：静态检验

```bash
npm run typecheck   # tsc --noEmit，必须零错误
npm run build       # 生产构建；确认 /theater /kindred /verify /search 等进路由表
```

## 第 2 步：知乎开放平台六接口直连检验

```bash
npm run verify:zhihu
```

脚本做的事（`scripts/verify-zhihu-api.mjs`）：

1. 从 `web/.env.local` 读凭证（只进内存，不打印、不进 shell 历史）；
2. 先取额度快照（quota 接口不消耗额度）；
3. 逐一实调六大能力，校验信封 `Code=0` 与响应形状（如 zhihu_search 必须含 Title/ContentText/Url/AuthorName）；
4. **热榜联动**：问题回答不写死题目，用热榜第一条问题链接实测，验证的是真实链路；
5. 再取额度快照——**检验后 − 检验前 = 本次真实消耗，六项应恰好各减 1**（多减说明有重复调用，少减说明走了缓存未打到真接口）。

判定：`8 过 / 0 跳过 / 0 败`。问题回答显示 SKIP（热榜无问题链接）不算失败。

## 第 3 步：运行时接口检验

```bash
npm run dev        # 起本地服务（另开终端）
```

逐项核对（应用层，验证的是「业务封装 + 缓存 + 降级」而不是裸接口）：

```bash
curl -s localhost:3000/api/zhihu/status | head -c 600   # configured:true，六能力带 quota，低额度标 low
curl -s "localhost:3000/api/topics"                     # source=zhihu-hot（有凭证时）
curl -s "localhost:3000/api/feed?tab=hot" | head -c 300 # 真人帖来自热榜话题的站内搜索
curl -s "localhost:3000/api/search?q=人工智能" | head -c 300  # 密封出口：结果无任何身份字段
curl -s localhost:3000/api/leaderboard | head -c 200
```

判定要点：

- `/api/zhihu/status` 是评委自查入口，`configured` 与额度必须与第 2 步快照一致；
- `/api/search` 与 `/api/feed` 的任何响应里**不得出现** `identity`/`isAI` 等身份字段（密封出口是玩法根基）；
- 连续刷两次同一查询，第二次应明显更快（命中缓存，不再消耗额度）。

## 第 4 步：界面走查

| 页面 | 看什么 |
|---|---|
| `/` 桌面 1470px | 右栏「知乎开放平台」卡：六能力名称 + `剩余/总量`，低于 10% 变红 |
| `/` 移动 390px | 单列不横向溢出，底部 tab 正常 |
| `/search` | 搜索出真实结果、排序 tab 正常、动作行不折行 |
| `/post/[id]` | 判断台、揭晓理由、评论区正常 |
| `/room/[id]` | 对局聊天、辅助按钮、结算卡 |
| 任意页断网/失败 | 降级提示是中文人话，无英文错误串 |

## 第 5 步：降级检验（模拟额度耗尽 / 无凭证）

```bash
mv .env.local .env.local.bak   # 摘除凭证
# 重启 dev server 后：
curl -s localhost:3000/api/zhihu/status   # configured:false，quota 全 null
curl -s "localhost:3000/api/topics"       # source=fallback，带人话 reason
# 首页右栏能力卡应显示「降级中」标签与「本地」字样，而非报错
mv .env.local.bak .env.local   # 恢复
```

判定：全链路降级但页面可用，提示文案符合「禁止泄漏英文错误串」比赛检查项。

---

## 六能力降级路径速查（代码事实）

| 能力 | 无凭证 | 调用失败/额度耗尽 | 降级后用户体验 |
|---|---|---|---|
| 热榜 | 演示话题库 | 过期缓存 → 演示话题库 | 话题照常，来源标注 fallback |
| 知乎搜索 | 空数组 | 空数组 | 真人池由居民帖兜底 |
| 全网搜索 | 空 + reason | 空 + 人话 reason | 判断辅助区提示暂不可用 |
| 直答 | 空 + reason | 空 + 人话 reason | Agent 内容走本地模板 |
| 问题推荐 | 空 + reason | 空 + 人话 reason | 同频匹配用本地话题种子 |
| 问题回答 | 空 + reason | 空 + 人话 reason | 真人池不扩充，页面无感 |

---

## 检验记录（2026-09-13 本轮实跑）

- 第 1 步：`tsc --noEmit` 零错误；生产构建通过。
- 第 2 步：**8 过 / 0 跳过 / 0 败**。额度实耗各 1：hot_list 47→46、zhihu_search 4890→4889、global_search 4999→4998、question_answers 94→93（热榜联动链接实测取回 5 条回答）、creator 97→96、zhida_openai 4999→4998。
- 第 3/4 步：dev server 实测通过（能力卡、/search、降级文案），截图 `docs/screenshots/v17-*`。
