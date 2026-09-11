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
