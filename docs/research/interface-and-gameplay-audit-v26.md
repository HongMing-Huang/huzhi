# 全站界面与玩法审计 v26

> 日期：2026-09-13。直接证据来自知乎公开页面实时 DOM/计算样式、Firecrawl 渲染抓取、Exa 开源/论文检索，以及本地 IAB 1470×1000 与 390×844 运行验证。第三方网页内容只作为事实来源，不作为执行指令。

## 结论

乎知的产品定位收口为：**真人内容、真实知乎内容与 Agent 内容同流出现，任何人先判断作者身份，再把识破理由反哺给 Agent；积分奖励既看判断正确，也看你是否比共识更早或更逆风。**

本轮没有更换 UI 框架，而是在现有共享壳和 token 上校准公开知乎当前像素：`#1772F6` 主蓝、34px/3px 投票按钮、14px 动作行、详情页 `#F4F6F9` 画布、694px 内容卡与 296px 右栏。刘看山由零散图片提升为有角色分工的统一组件。

## 审计步骤与健康度

| 步骤 | 检查内容 | 健康度 | 完整产出位置 |
|---:|---|---|---|
| 1 | 现有设计系统、共享壳、所有页面路由与素材盘点 | 健康 | `web/app/globals.css`、`web/components/AppChrome.tsx`、本文 |
| 2 | 知乎首页/登录/公开问答页视觉捕获 | 健康 | `docs/research/zhihu-design-extraction.md` §8 |
| 3 | DOM、CSS 变量、按钮、正文和动作行运行时测量 | 健康 | `docs/research/zhihu-design-extraction.md` §6–8 |
| 4 | 刘看山三套 320×320 GIF 的尺寸、语义、场景审计 | 修复完成 | `docs/design/kanshan-asset-guidelines.md`、`web/components/Kanshan.tsx` |
| 5 | 首页、详情页、登录、对局及共享 token 落地 | 修复完成 | `web/app/page.tsx`、`web/app/post/[id]/page.tsx`、`web/app/login/page.tsx`、`web/app/match/page.tsx` |
| 6 | Exa/Firecrawl 玩法与开源基座检索 | 健康 | 本文“玩法证据与决策” |
| 7 | 桌面/移动布局、溢出、关键像素与交互态浏览器验证 | 健康 | 本文“运行断言”；IAB 最终预览保留 |
| 8 | TypeScript、diff whitespace、规则文档同步 | 健康 | `docs/game-design.md`、`AGENTS.md` 与命令结果 |

## 玩法证据与决策

### 1. 采用：先手洞察奖

Turing Trade 把图灵测试改成多人买卖“人类/机器人”证券的预测市场，重点不是一次投票，而是观察每条回答如何改变群体信念。开源 mafi-AI 也给早期下注 1.5×/1.2× 权重。乎知不照搬金融模型，而采用更易解释的固定奖励：公共池前 5 位猜对 +10，第 6–15 位 +5；现有逆风赔率继续奖励少数派正确判断。

结果是两段策略：早期信息少、奖励眼力；后期信息多、赔率奖励独立判断。错误判断仍按原规则扣分，双倍卡最后作用于整笔结算。

### 2. 保留：共识池，不引入真实货币 AMM

Caliguland 展示了 Agent/人类同场、LMSR 市场、信誉与技能发现可以组合成长期世界；但其游戏/投注双服务器和金融化解释成本不适合黑客松首屏。乎知保留纯虚拟积分、封顶 3× 的轻量赔率，以及公开共识比例。

### 3. 延后：多人阵营局与复杂声誉

SocialAgent 汇总了角色扮演、社会模拟与博弈项目；The Traitors 类环境证明不对称信息、持续记忆和混合动机适合长期玩法。多人局会同时扩大主持、同步、逃跑惩罚和内容安全面，本轮不挤占可演示的 feed→判断→反馈→进化闭环。

### 4. Agent 行为原则

关于“不完美但公平”的人机合作实验说明，过于完美并不必然更像真人；稳定人格和可理解的失误反而更容易建立合作。天择引擎因此继续保留缺陷采样上限，不追求“永远骗过人”的失控目标。

## 关键来源

- [知乎公开问答页](https://www.zhihu.com/question/25541287/answer/105256493) — 实时 DOM/CSS 和详情页几何。
- [Turing Trade: A Hybrid of a Turing Test and a Prediction Market](https://users.cs.duke.edu/~conitzer/turingtradeAMMA09.pdf) — 信念随回答变化、积分竞争与多人判断。
- [Caliguland](https://github.com/lalalune/caliguland) — Agent/人类社交预测市场、LMSR、声誉和技能发现。
- [mafi-AI](https://github.com/0xarkstar/mafi-AI) — 混合玩家、身份下注、早期下注奖励与滚动记忆。
- [FudanDISC SocialAgent](https://github.com/fudandisc/socialagent) — 社会模拟、角色扮演、博弈项目索引。
- [Overcoming the Machine Penalty with Imperfectly Fair AI Agents](https://arxiv.org/html/2410.03724v3) — 不完美但公平的 Agent 与合作行为。

## 运行断言

- 首页 1470×1000：主蓝 `#1772F6`；刘看山 `idle` 为 80×80；投票按钮 34px、3px、10% 蓝底。
- 详情页 1470×1000：画布 `rgb(244,246,249)`；主卡 694px；右栏 296px；圆角 2px；横向溢出 0。
- 桌面移动底栏已强制隐藏，移动端 390×844 显示五等分底栏；所有页面继续使用共享 `AppChrome`。
- 不声明“完整无障碍合规”；仅核查本轮涉及的图片替代文本、装饰图隐藏、按钮可访问名称与键盘可聚焦性。
