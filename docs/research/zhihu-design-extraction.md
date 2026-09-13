# 知乎官方设计提取规格（浏览器实爬 zhihu.com/follow 计算样式）

> 提取方式：Playwright 控制已登录会话，getComputedStyle 逐元素采样 + 全页色频统计。
> 应用位置：`web/app/globals.css` 与各页面（2026-09-11）。

## 1. 色板（官方全页色频 Top）

| 颜色 | 用途 | 我们的 token |
|---|---|---|
| `#191B1F` | 主文字（频次最高 1073） | `--ink` |
| `#373A40` | 次级文字/作者名 | `--ink-2` |
| `#8491A5` | 动作行按钮、辅助文字（207 次） | `--action` |
| `#1772F6` | 主蓝（118 次） | `--zhihu` |
| `#09408E` | 深蓝（按压/悬停深态） | hover 深化 |
| `#535861` / `#ADAEB7` / `#9196A1` | 中性灰阶 | `--muted` 系 |
| `#D95350` | 红（热标签） | 热 tag |
| `#F8F8FA` | 信息流分隔线 | `--divider` |
| `#FFFFFF` | 页面与卡片底 | `--bg`/`--card` |

## 2. 字体表

| 元素 | 官方值 | 我们 |
|---|---|---|
| 字体栈 | -apple-system, system-ui, Helvetica Neue, PingFang SC, Microsoft YaHei, Source Han Sans SC, Noto Sans CJK SC, MiSans L3, Segoe UI | 同（globals body） |
| 基础 | 15px / #191B1F | ✓ |
| 帖子标题 | 18px / **500** / 行高 1.6 / #191B1F | ✓ FeedCard h2 |
| 作者名 | 15px / #373A40 / **500** | ✓ 语义行加粗 |
| 正文 | 15px / #191B1F / 行高 1.67 | ✓ |
| 搜索输入 | 14px / 20px 行高 | ✓ |
| 动作按钮 | 14px / #8491A5 / weight 400 | ✓ |
| Logo | 书法体（官方为图片字标） | 楷体族 .logo-script |

## 3. 关键组件规格

| 组件 | 官方规格 |
|---|---|
| 顶栏 | 白底、高 58px、无边框；logo 钉页面左缘 40px（不在内容列内）；搜索框视口居中（约 43vw，max 960）；图标导航贴右 40px |
| 左导航卡 | 圆角 16px；导航项胶囊圆角 18px、14px；滚动折叠为图标栏（64px），**悬停展开 176px 覆盖层**；蓝色圆角「＋ 创作/发起对局」主按钮 |
| 信息流条目 | 无卡片盒：白底 + 分隔线 `#F8F8FA` + 条目纵向 20px；语义行「xx 赞同了/发布了想法 · 时间」 |
| 赞同按钮 | 未赞=10% 蓝底/已赞=实心蓝白字；圆角 3px；内边距 0 12px；14px |
| 评论/收藏/喜欢/分享 | 透明底、#8491A5、14px |
| 「发想法」 | 8% 蓝底、999px 胶囊、15px medium |
| 「进入创作中心」 | 20% 浅蓝底、4px 圆角、36px 高 |
| 右栏卡 | 白底分段，官方无重边框（弱化卡片感） |

## 4. 动效

- 官方以 css-in-js `transition: all` 短过渡为主，动效集中在**状态切换瞬间**（赞同变实心、按钮 hover 变色）。
- 我们实现：赞同数字 pop 弹跳（0.35s 回弹）+ 胶囊实心切换；卡片入场 fade-up stagger（40ms/卡）；骨架 shimmer；揭晓 flip；打字三点；全部 transform/opacity 合成器友好，带 `prefers-reduced-motion` 降级。

## 5. 图标

官方为 24 网格 SVG 线性图标（fill none / width 18）。我们：`components/Icons.tsx` 同规格（stroke 1.8），已覆盖导航/动作/身份/道具全场景，全站 emoji 已清零。

## 6. 代码级提取补充（第二轮：CSS 变量与命中规则）

### 官方 CSS 变量实值（:root）
| 变量 | 值 | 用途 |
|---|---|---|
| `--GBK02A` | #191b1f | 标题/主文字 |
| `--GBK03A` | **#373a40** | 作者名 |
| `--GBK04A` | **#535861** | 语义行/meta |
| `--GBK05A` | **#81858f** | 时间戳 |
| `--GBL05A` | **#8491a5** | 动作按钮灰蓝 |
| `--MapUIFrame10A` | **#f8f8fa** | 搜索框底/分隔线 |
| `--zFontWeightBold` | **500** | "粗体" = 500 |
| 主按钮蓝 | **#0066FF**（.Button--primary bg rgb(0,102,255)） | |

### 命中的官方 CSS 规则（原文）
- `.SearchBar-input`: `height:40px; border:1px solid var(--MapUIFrame10A); background:var(--MapUIFrame10A)`
- `.SearchBar-input.is-focus`: `border-color:transparent; background: linear-gradient(#fff,#fff) padding-box, linear-gradient(90deg,#0090FF 0%,#1772F6 100%) border-box` ← **聚焦渐变描边**（已照搬）
- `.ContentItem-title`: `color:var(--GBK02A); font-size:18px; font-weight:500`
- `.TopstoryItem-isFollow`: `padding-top:15px`
- `.TopstoryItem-isRecommend`: `padding:20px var(--container-padding-x,20px)`
- `.VoteButton--down`: `margin-left:4px`
- `.ContentItem-meta`: `color:var(--GBK04A); font-size:15px`
- `.ContentItem-time`: `font-size:14px; color:var(--GBL05A); margin-top:10px`

### 乎知应用对照
- 全站 token 已切换：`--zhihu:#1772f6`、`--meta:#535861`、`--time:#81858f`、`--frame:#f8f8fa`。其中主蓝以 2026-09-13 公开问题页运行时的 `--GBL01A` 与 VoteButton 计算值为准，修正了旧轮次把另一套按钮态误记为 `#0066ff` 的口径。
- 搜索框聚焦渐变描边已实现并运行时断言（bgHasGradient=true）
- 已赞同胶囊：实心蓝白字（官方 voted 态）+ ▼ 独立反对钮（margin-left 4px）

## 7. 组件级提取（第三轮：DOM 结构 / 间距 / 动画 / JS，browser-use + 已登录会话）

### 帖子卡官方 DOM 结构（真实类名树）
```
div.Card.TopstoryItem
  div.Feed
    div.FeedSource                        ← 语义区
      div.FeedSource-firstline            ← "xx 赞同了文章 · 54 分钟前"
        span ×2（动作来源 / span.Bull="·" 分隔符）
      div.AuthorInfo.FeedSource-byline    ← 作者行（头像+名+头衔）
    div
      div.ContentItem.ArticleItem
        h2.ContentItem-title
        meta ×6                           ← SSR SEO 结构化数据
        div.RichContent.is-collapsed      ← 折叠正文（展开/收起态类切换）
```

### 间距系统（官方精确值）
| 元素 | margin | padding | 字号/行高 |
|---|---|---|---|
| 帖子卡 | 0 | **15px 0 16px** | 15px |
| 标题 | **-4px 0**（负值收紧） | 0 | 18px / 28.8px |
| 正文 | **9px 0 -4px** | 0 | 15px / 25.05px |
| 动作行 | **0 0 -10px** | **10px 0** | 15px |
| 作者名 | 0 | 0 | 15px / 16.5px |

### 动画系统（transition 全页统计）
| 时长 | 用途（推断） | 缓动 |
|---|---|---|
| **0.14s** ×1 | hover 快速反馈 | ease-out |
| **0.3s** ×2 | 状态切换（折叠展开等） | linear |
| **0.5s** ×5 | 弹层/浮层 | linear |

→ 乎知已固化为 `--dur-fast:140ms / --dur-state:300ms / --dur-layer:500ms` 三档 token。

### JS 架构
- React SSR（根节点 `#js-initialData` 注水；新版无 `window.__INITIAL_STATE__`）
- 帖子数据经 meta 标签输出 SEO 结构化数据

### 登录页（browser-use 独立浏览器提取）
- 整页背景 **rgb(184,229,248)** 淡蓝；左品牌卡（蓝底 logo+slogan）+ 右白卡表单
- 提交按钮：**352×36 / 3px 圆角 / #1772F6 / mt-30px**
- 输入框：**48px 高、透明底、底线式**（官方 .Input 无边框设计）
- tab 激活色 #09408E；logo mb-24px；footer 12px

→ 乎知应用：FeedCard 重写为官方结构（语义行 firstline+Bull+byline / 标题 18px/28.8 / 正文 15px/25.05 / 动作行 py-10px）；动画三档 token。

## 8. 公开问题页复核（2026-09-13，Firecrawl + IAB）

- 样本：`https://www.zhihu.com/question/25541287/answer/105256493`；Firecrawl 抓到约 470KB 渲染后 HTML，IAB 关闭登录提示后读取实时计算样式。
- 视口 1280×720：页面画布 `rgb(244,246,249)`；回答正文 15px / 25.05px；`.RichContent-inner--collapsed` margin `9px 0 -4px`。
- `.ContentItem-actions`：54px 高度语义，padding `10px 20px`，margin `0 -20px -10px`；评论等文本按钮 14px、`#8491A5`。
- VoteButton：34px 高、3px 圆角、`rgba(23,114,246,.1)` 背景、`rgb(23,114,246)` 文字；状态过渡 0.3s linear。
- 主内容与右栏在乎知详情页落为 694px / 296px，间距 16px；1470×1000 运行时断言为 x=232/942，横向溢出 0。
- 刘看山只承担判断提示，不参与答案泄漏；详情页使用 64px `idle`，完整规范见 `docs/design/kanshan-asset-guidelines.md`。
