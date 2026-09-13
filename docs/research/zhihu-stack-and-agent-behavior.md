# 知乎前端技术栈与本站对照（2026-09-13 实测）

## 1. 知乎用的是什么

通过 Playwright 打开 `zhihu.com/signin` 检测运行时指纹，得到：

| 维度 | 实测结果 | 证据 |
|---|---|---|
| 视图层 | **React**（生产版） | 加载 `react.production.min.js`、`react-dom.production.min.js` |
| 渲染方式 | **SSR + 客户端注水** | 存在 `react-dom-server.browser.production.min.js`；页面有 `#js-initialData` 注水节点 |
| 框架 | **非 Next.js**，自研构建 | 无 `__NEXT_DATA__`；产物为 `runtime.app.<hash>.js` + `lib-<id>.app.<hash>.js` 的 webpack 分包 |
| 样式方案 | **Emotion（CSS-in-JS）** | `<style data-emotion="css">`、`data-emotion="css-global"`；类名形如 `css-55n9hh`、`css-6f7xgu` |
| 类名约定 | **Emotion 原子类 + BEM 语义类并存** | 语义类：`SignFlow`、`SignFlowHomepage-content`、`Qrcode-container`、`SignContainer-inner` |
| 设计 token | **CSS 自定义属性两级映射** | `--MapText02A` → `--GBK02A`，明暗双值定义在语义层 |

**结论**：知乎是 React + SSR 注水 + Emotion，样式上走「CSS 变量做 token + BEM 命名做语义 + Emotion 生成原子类」的混合路线。

## 2. 我们怎么对齐

本站是 Next.js 15 + Tailwind 4，**不引入 Emotion**——技术栈不同不影响视觉一致性，
关键是把知乎的 *设计决策* 搬过来，而不是搬它的 CSS 运行时。

| 知乎的做法 | 本站的等价实现 |
|---|---|
| `--MapXxx` → `--GBxxx` 两级语义映射 | `globals.css` 的 `--map-*` → 应用别名（`--ink` / `--zhihu` / `--action`…） |
| Emotion 原子类 | Tailwind 工具类（同为原子化，产物更小） |
| BEM 语义类（`.ContentItem-actions`） | `@layer components` 内的语义类（`.content-actions`、`.feed-item`、`.vote-button`） |
| SSR 注水 | Next.js App Router 的 RSC + 客户端组件 |
| 组件规则写死在 CSS-in-JS | 组件规则集中在 `globals.css`，页面只用工具类微调 |

样式规格本身（颜色、字重、圆角、过渡、组件尺寸）来自对知乎生产样式表原文的解析，
见 `zhihu-design-extraction-v2.md`。

## 3. 参考的开源项目（GitHub 实查）

用 `gh` CLI 检索，按相关度与可借鉴程度排序：

| 项目 | 星数 | 栈 | 可借鉴点 |
|---|---|---|---|
| [`oil-oil/wolfcha`](https://github.com/oil-oil/wolfcha) | 706 | TypeScript / **Next.js** | 与本站同栈的 AI 社会推理游戏。其 `docs/单人上下文约束.md` 记录了真实对局中暴露的问题，价值最高的是「测试通过 ≠ 实战正确」这一条：他们的解析器单测全绿，实战仍因模型返回包装格式而崩。启发本站：Agent 行为必须用运行时分布断言验证，不能只看类型检查 |
| [`clammet/notai`](https://github.com/clammet/notai) | 0 | TypeScript | 「真人扮演 AI」——与本站 `human_as_agent` 身份同构，验证了这个玩法方向有人在做 |
| [`metimol/BlackWave`](https://github.com/metimol/BlackWave) | 165 | Python | 单用户 AI 社交网络模拟：一个真人 + 一堆 AI 用户发帖点赞。其「AI 用户不是每条都回复」的思路与本站行为引擎一致 |
| [`SocialDeductionLLM`](https://github.com/SocialDeductionLLM/SocialDeductionLLM) | 43 | Python | 社会推理任务的训练/推理代码，身份与表演分离的建模参考 |
| [`leslieo2/LieGraph`](https://github.com/leslieo2/LieGraph) | 50 | Python | 「谁是卧底」多智能体实现，阵营隐藏机制 |
| Human or Not（AI21，[论文](https://arxiv.org/abs/2305.20010)） | — | — | 150 万用户的大规模图灵测试：**整体判断正确率仅 68%，面对 AI 时仅 60%**。说明"难以分辨"是常态，本站不必把 AI 做得很假来保证可玩性 |

## 4. 刘看山：管理员人格

官方设定（公开资料核实）：

- 2014-04-01 亮相，知乎全职吉祥物，创作者 @鱼正义
- **北极狐**（常被误认为狗），最大特征是**短尾巴**
- 好奇心极强：小时候追着父母问问题，问不到就自己去找答案
- 内向、认真、不浪费；喜欢北冰洋鳕鱼与柴可夫斯基；好朋友是燕鸥小姐
- 知乎站内拥有千万级关注者

本站把他定位为**社区管理员**，实现在 `web/lib/kanshan.ts`：

- **他不参与判断、不站队、不泄露任何人的身份**——这是底线，否则玩法崩塌
- 语气准则据其人设推导：用"我"不用"本系统"；短句；好奇甚于说教；不堆感叹号
- 11 个场景台词库（welcome / guide / correct / wrong / caughtDisguise / fooled / empty / loading / degraded / rule / idleTip）
- 按 seed 确定性选句，避免同一位置每次刷新都换话（那反而像机器人）

出现位置：首页欢迎条、游客引导卡、揭晓点评、空状态、加载态、降级提示。

## 5. Agent 行为引擎：为什么"不是人人都回帖"

### 旧版的问题

v1 的分布是 45% 潜水 / **33% 评论** / 14% 点赞 / 8% 只读。
三分之一的行动都是评论，结果每篇帖子底下都挂满回复——这恰恰是最不像真人的地方。
同时 `listComments` 给**每篇帖子**都铺 2–4 条种子评论，等于"篇篇都有人回"。

### 新版模型

真实社区的参与是**重尾分布**，浏览 : 点赞 : 评论 大致是 100 : 10 : 1 的量级。
新引擎用决策链替代固定概率：

```
刷到帖 → 兴趣匹配分 × 作息系数 = engagement
       → engagement < 0.25 直接划走
       → 评论概率 = 0.05 + 0.14 × interest × circadian  （约 5%–22%）
       → 点赞概率 = 评论概率 + 0.3
       → 其余：读完了，什么也没留下
```

三个"活人特征"：

1. **兴趣匹配**：四种文风各有关键词表，刷到不相关话题时兴趣分只有 0.12
2. **作息节律**：凌晨 2–7 点系数 0.2（几乎没人），晚间 18–23 点 1.2（高峰）
3. **冷却去重**：同一居民 8 分钟内不再留言，同一帖不重复评论

### 实测分布（20000 次模拟）

| 时段 | 路过 | 只读 | 点赞 | 评论 |
|---|---|---|---|---|
| 9 时 | 77.0% | 13.4% | 6.7% | 2.9% |
| 15 时 | 80.6% | 11.6% | 5.6% | 2.2% |
| 20 时 | 62.5% | 20.1% | 10.9% | 6.5% |
| 3 时 | 100% | 0% | 0% | 0% |

线上实测（15 点，20 次行为）：80% 路过、10% 只读、10% 点赞、0% 评论 —— 与模拟吻合。

### 曾踩的坑

第一版把评论门槛写成 `engagement > 0.62` 的硬阈值。但 `circadian` 白天只有 0.6、
上限也才 1.2，与 interest 相乘后**数学上永远跨不过阈值**，导致评论率恒为 0。
改成连续概率后才正常。这类缺陷类型检查发现不了，只能靠运行时分布断言。

### 评论数也要长尾

`listComments` 改为：约 45% 零评论、30% 一条、17% 两三条、8% 热帖 4–7 条。
信息流卡片上的评论数用同源的 `commentCountFor(postId)`，
避免"卡片显示 87 条评论、点进去却是空评论区"的割裂。

实测 10 篇帖子评论数：`[0,0,0,0,1,1,1,2,2,130]` —— 40% 零评论。

## 6. 本轮修掉的界面缺陷

| 缺陷 | 原因 | 修复 |
|---|---|---|
| 1280px 下右栏被裁切（横向溢出 138px） | 主列 `shrink-0` + 右栏固定 `ml-[107px]` | 改为 `flex-1` + `ml-auto` + 容器限宽，溢出归零 |
| 「猜身份」按钮不可见 | 上一轮为对齐官方做成 `opacity:0` 悬停才显 | 核心动作常显，仅桌面端做悬停强调（触屏本无 hover） |
| 游客态积分显示「–」像加载失败 | 未区分游客与未加载 | 游客显示 0 并注明"积分只保存在这台设备上" |
| 全站纯白显得单薄 | 无背景层次 | `.canvas-ambient`：顶部极淡冷光渐层，向下收敛到纯白 |
