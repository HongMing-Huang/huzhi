# 知乎官方设计提取 v2（样式表级，2026-09-13）

> 上一版（`zhihu-design-extraction.md`）是浏览器 `getComputedStyle` 抽样，样本受登录态与风控限制。
> 本版改为直接解析知乎线上生产样式表原文，拿到的是**规则本身**（含状态态、动画、焦点环），而不是某一次抽样的计算值。

## 0. 提取方式与证据链

- Playwright 打开 `https://www.zhihu.com/signin`（首页 `/` 会 302 到登录页；`/question/*` 与 `zhuanlan` 触发 40362 风控，正文不可读）。
- 从 `document.styleSheets` 取到官方生产 CSS 资源清单，curl 下载后按规则解析：
  - `https://static.zhihu.com/heifetz/main.216a26f4.b07163e781151f6e9996.css`（2002 条规则，261 KB）
  - `https://static.zhihu.com/heifetz/7936.216a26f4.68a15c300a80da6dccde.css`（1840 条规则，215 KB）
- 运行时交叉验证：登录页 `:root` 计算值与样式表解析值一致（`--GBL01A=#1772f6`、`--GBK04A=#535861`、`--MapUIFrame10A=#f8f8fa`）。

## 1. 官方色彩语义层（Map* → GB* 两级映射）

知乎不是"一堆十六进制"，而是 **语义映射层**：`--MapXxx` 定义明暗双值，`--GBxxx` 再引用语义层。我们按同样两级建模。

| 官方语义变量 | light 值 | 语义 | 乎知 token |
|---|---|---|---|
| `--MapText02A` → `--GBK02A` | `#191b1f` | 主文字/标题 | `--ink` |
| `--MapText03A` → `--GBK03A` | `#373a40` | 次级文字、作者名 | `--ink-2` |
| `--MapText04A` → `--GBK04A` | `#535861` | 语义行、动作行文字 | `--meta` |
| `--MapText05A` → `--GBK05A` | `#81858f` | 时间戳 | `--time` |
| `--MapText06A` → `--GBK06A` | `#9196a1` | 热榜排名数字 | `--muted` |
| `--MapText07A` → `--GBK07A` | `#adb0b7` | 最弱提示文字 | `--faint` |
| `--MapUIFrame08A` → `--GBK08A` | `#c4c7ce` | 图标禁用/关闭态 | `--icon-weak` |
| `--MapUIFrame09A` → `--GBK09A` | `#ebeced` | 分隔线（.5px 细线） | `--line` |
| `--MapUIFrame10A` → `--GBK10A` | `#f8f8fa` | 搜索框底、卡内分隔 | `--frame` / `--divider` |
| `--MapUIFrame10C` → `--GBK10C` | `#f4f6f9` | 详情页画布灰 | `--canvas` |
| `--MapInfo` → `--GBL01A` | `#1772f6` | 主蓝（品牌/主按钮/赞同） | `--zhihu` |
| `--MapInfoSub` → `--GBL05A` | `#8491a5` | 动作按钮灰蓝 | `--action` |
| `--MapLink` → `--GBL07A` | `#09408e` | 链接 hover 深蓝 | `--link-deep` |
| `--MapBrandLight` | `#a8cffe` | 浅蓝描边/选中 | `--brand-light` |
| `--MapHighlight` → `--GYL01A` | `#f77a31` | 热榜"热"橙 | `--hot` |
| `--MapCriticalHot` → `--GRD03A` | `#d95350` | 红标签 | `--danger` |
| `--MapPositiveDonate` → `--GRD01A` | `#f05159` | 赞赏红 | `--like` |
| `--MapPass` → `--GGN01A` | `#67c23a` | 通过/正确绿 | `--ok` |
| `--MapVIPBrand` → `--GYL10A` | `#ce994f` | 盐选金 | `--gold` |
| 主按钮 hover | `#0063e4` | `.Button--primary.Button--blue:hover` | `--zhihu-deep` |

**修正点**：旧版把主按钮 hover 记成 `--zhihu-deep:#0d65d9`（推测值）。官方规则原文是 `background-color:#0063e4`。

**字重修正**：`--zFontWeightBold` 不是固定 500。官方三分支：
```
html                → 600
html[data-apple], html[data-ios] → 500
html[data-android]  → 700
```
旧版文档只记了 500，导致我们全站"粗体"偏细。正确做法是按平台派生（见 globals.css 的 `--w-bold`）。

## 2. 组件规则原文（关键，均为样式表直取）

### 按钮（.Button 家族）
```css
.Button{background:none;border:1px solid;border-radius:3px;color:var(--GBL05A);
        font-size:14px;line-height:32px;padding:0 16px;text-align:center}
.Button:focus{outline:none;transition:box-shadow .3s}
.Button:disabled{cursor:default;opacity:.5;pointer-events:none}
.Button--blue{border-color:var(--GBL01A);color:var(--GBL01A)}
.Button--blue:hover{background-color:rgba(23,114,246,.06)}
.Button--primary.Button--blue{background-color:var(--GBL01A);color:#fff}
.Button--primary.Button--blue:hover{background-color:#0063e4;border-color:#0063e4}
.Button--grey:hover{background-color:rgba(132,145,165,.06)}
.Button--red{border-color:var(--GRD01A);color:var(--GRD01A)}
```
要点：**圆角 3px（不是 4px）**、**line-height:32px + padding 0 16px**（高度靠行高撑）、disabled 是 `opacity:.5` + `pointer-events:none`、hover 是 6% 同色底。

### 赞同按钮（.VoteButton）
```css
.VoteButton{background:rgba(23,114,246,.1);border-color:transparent;
            color:var(--GBL01A);padding:0 10px}
.VoteButton:not(:disabled):hover{background-color:rgba(23,114,246,.15)}
.VoteButton.is-active{background:var(--GBL01A);color:#fff}
.VoteButton.is-active:hover{background-color:var(--GBL01A)}
.VoteButton:disabled:hover{background:var(--GBK10A)}
.VoteButton--down{margin-left:4px}
.VoteButton-TriangleUp,.VoteButton-Ship{margin-right:5px}
```
要点：padding 是 **0 10px**（旧版记的 0 12px）；hover 15%（旧版未记）；已赞 hover **不变色**（防误触反馈）。

### 内容条目
```css
.ContentItem-title{color:var(--GBK02A);font-size:18px;font-weight:var(--zFontWeightBold);
                   line-height:1.6;margin-top:-4px;margin-bottom:-4px;word-break:break-word}
.ContentItem-title a:hover{color:var(--GBL07A)}       /* #09408e */
.ContentItem-title+.ContentItem-meta{margin-top:6px}
.ContentItem-meta{color:var(--GBK04A);font-size:15px}
.ContentItem-time{color:var(--GBL05A);font-size:14px;margin-top:10px;display:flex;align-items:center}
.ContentItem-time a:hover{text-decoration:underline;
   text-decoration-color:rgba(132,145,165,.72);text-underline-offset:4px}
.ContentItem-actions{color:var(--GBK04A);display:flex;align-items:center;clear:both;
   margin:0 calc(var(--zhc-padding-horizontal)*-1) -10px;padding:10px var(--zhc-padding-horizontal)}
.ContentItem-action{font-size:14px;margin-left:24px}
.ContentItem-action:first-child{margin-left:0}
.ContentItem-actions.is-fixed{box-shadow:0 -1px 3px rgba(25,27,31,.1);margin:0;background:#fff}
.ContentItem-arrowIcon.is-active{transform:rotate(180deg)}
```
要点：动作项间距是 **margin-left:24px**（我们之前用 18px）；标题字重取 `--zFontWeightBold`（非固定 500）；标题链接 hover 变深蓝 `#09408e`；`.is-fixed` 是滚动吸底动作条。

### 折叠正文遮罩（官方"阅读全文"渐隐）
```css
.RichContent.is-collapsed .RichContent-inner{max-height:100px}
.RichContent--unescapable.is-collapsed .RichContent-inner{
  mask-image:linear-gradient(#191b1f calc(100% - 110px),
             rgba(25,27,31,.15) calc(100% - 72px),
             transparent calc(100% - 62px))}
```
**这是旧版完全没提取到的**：官方折叠不是 `-webkit-line-clamp`，而是 **max-height + mask 渐隐**，所以底部是柔和淡出而不是硬截断。

### 信息流条目与卡片
```css
.TopstoryItem{border-radius:0;padding:16px var(--container-padding-x,20px);position:relative;overflow:visible}
.TopstoryItem:hover .TopstoryItem-rightButton{opacity:1}     /* 悬停才露出右侧按钮 */
.TopstoryItem .ContentItem-actions .Button:not(.Button--plain){line-height:30px;padding:0 12px}
.Topstory-mainColumnCard{box-shadow:0 1px 3px rgba(0,0,0,.1)}
.Topstory-mainColumnCard .Card:not(.Topstory-tabCard){border-bottom:1px solid var(--GBL10A);box-shadow:none;margin-bottom:0}
.Topstory-tabs{border-bottom:1px solid var(--GBL10A)}
.Card-header{height:50px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--GBK10A)}
.Card-headerText{font-weight:var(--zFontWeightBold);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.Card-section{padding:16px 20px;position:relative}
.Card-section+.Card-section:after{content:"";position:absolute;top:0;left:0;right:0;margin:0 20px;border-bottom:1px solid var(--GBK10A)}
```
要点：卡片阴影是 **0 1px 3px rgba(0,0,0,.1)**，不是我们之前的 `0 4px 16px`；卡头固定 50px；卡内分段用 `:after` 内缩分隔线（左右各留 20px），不是通栏 border。

### Tabs（官方下划线 3px）
```css
.Tabs-item{display:inline-block;padding:0 20px}
.Tabs-link{color:var(--GBK02A);font-size:16px;line-height:22px;padding:14px 0;position:relative}
.Tabs-link.is-active{font-weight:var(--zFontWeightBold)}
.Tabs-link.is-active:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:3px;background:var(--GBL01A)}
.Tabs{border-bottom:1px solid var(--GBK10A)}
.SearchSubTabs-item{background:var(--GBK10A);border-radius:2px;color:var(--GBK05A);font-size:14px;height:30px;padding:5px 20px}
.SearchSubTabs-item.is-active{background-color:rgba(23,114,246,.08);color:var(--GBL01A)}
```
要点：激活下划线 **3px 且 bottom:-1px**（压住容器边框）；激活态**不改变颜色只加粗 + 下划线**（我们之前把激活 tab 染成蓝字，与官方不符）。

### 热榜条目
```css
.HotItem{display:flex;padding:16px 0;margin-left:var(--container-padding-x,24px);background:#fff}
.HotItem:not(:first-child){border-top:.5px solid var(--GBK09A)}
.HotItem-index{margin-right:24px;text-align:center}
.HotItem-rank{color:var(--GBK06A);font-size:18px;font-weight:var(--zFontWeightBold);line-height:1.6;width:20px}
.HotItem-hot{color:var(--GYL01A)}          /* #f77a31 */
.HotItem-label{border-radius:4px;color:#fff;font-size:12px;height:19px;line-height:19px;width:19px;margin:0 auto}
```
要点：分隔线是 **.5px**；排名数字 18px、宽 20px、右间距 24px；热度色是橙 `#f77a31`。

### 搜索框（聚焦渐变描边，旧版已实现，本版复核）
```css
.SearchBar{display:flex;height:34px}
.SearchBar .SearchBar-input{padding-left:12px;padding-right:0;width:100%;transition:width .2s ease}
.SearchBar-input.is-focus{border-color:transparent;
  background:linear-gradient(#fff,#fff) padding-box,
             linear-gradient(90deg,#0090FF 0%,#1772F6 100%) border-box}
```

### 登录页（运行时实测 + 规则）
```css
.SignFlow{width:352px;padding:0 24px 30px}
.SignFlow-tab（active）{font-size:16px;font-weight:500;line-height:46px;margin-right:24px}
.SignFlow-submitButton{height:36px;margin-top:30px;width:100%}
input.Input{height:48px;border:0;background:transparent;font-size:14px;line-height:24px;color:#373a40}
```
登录页 body 背景实测 `rgb(244,246,249)`（`--MapUIFrame10C`），不是旧版记的 `#b8e5f8` 淡蓝——那是更早改版的值。

### 焦点可见性（官方无障碍实现，旧版完全没记）
```css
html[data-focus-visible] .TopstoryItem:focus:before,
html[data-focus-visible] .HotItem:focus:before{
  box-shadow:0 0 0 2px #fff, 0 0 0 5px rgba(23,114,246,.3)}
.TopstoryItem:focus:before{position:absolute;inset:0;content:"";pointer-events:none;
  transition:box-shadow .3s;z-index:1}
```
即：**双层焦点环**（先 2px 白隔离环，再 3px 蓝半透明环），且只在键盘导航（`data-focus-visible`）时出现。

## 3. 动效系统（全量统计，非抽样）

对两份样式表的 `transition` 声明做频次统计：

| 频次 | 值 |
|---|---|
| 11 | `box-shadow .3s` |
| 6 | `box-shadow .3s,-webkit-box-shadow .3s` |
| 5 | `opacity .3s ease-out` |
| 4 | `transform .2s ease-out,opacity .2s ease-out` |
| 4 | `background .2s,border .2s` |
| 4 | `all .3s ease-in-out` |
| 3 | `transform .3s` |
| 2 | `background-color .2s ease-in-out` / `opacity .3s,visibility .3s` / `max-height .8s ease` |

结论：官方三档实为 **.2s（位移/背景）/ .3s（阴影、透明度、状态）/ .8s（高度展开）**，缓动以 `ease-out` 为主。旧版记的 "0.14s / 0.3s / 0.5s" 只有 0.3s 对上了。

官方 keyframes 原文（我们据此重建入场动效）：
```css
@keyframes spring-in {0%{opacity:.01;transform:translate(-50%,-20px)} to{opacity:1;transform:translate(-50%)}}
@keyframes spring-out{0%{opacity:1;transform:translate(-50%)} to{opacity:0;transform:translate(-50%,-20px)}}
@keyframes fsSlideUp  {0%{opacity:0;transform:translateY(40px)} to{opacity:1;transform:translateY(0)}}
@keyframes slideInUp  {0%{transform:translate3d(0,100%,0);visibility:visible} to{transform:translateZ(0)}}
```
特征：**只用 opacity + transform**（合成器友好），位移量 20–40px，无弹跳过冲。

## 4. 圆角频次（官方实际分布）

| 半径 | 出现次数 | 典型用途 |
|---|---|---|
| 4px | 76 | 通用容器、标签 |
| 3px | 40 | **按钮、赞同胶囊** |
| 6px | 25 | 弹窗/大卡 |
| 2px | 22 | 小标签、SubTab |
| 50% | 19 | 头像 |
| 8px | 18 | 卡片组 |

→ 官方是"小圆角体系"，主力 3–4px。我们代码里的 `rounded-lg(8px)`/`rounded-xl(12px)`/`rounded-2xl(16px)` 明显偏圆，是"AI 生成感"的主要来源之一。

## 5. 与乎知的差异清单（本轮修复项）

| # | 官方规则 | 乎知旧实现 | 处理 |
|---|---|---|---|
| 1 | `--zFontWeightBold` 平台分支 600/500/700 | 固定 500 | 按平台派生 `--w-bold` |
| 2 | 主按钮 hover `#0063e4` | 推测 `#0d65d9` | 改为官方值 |
| 3 | `.VoteButton` padding `0 10px`，hover 15% | `0 12px`，无 hover 档 | 对齐 |
| 4 | 动作项 `margin-left:24px` | 18px | 对齐 |
| 5 | 折叠正文 = max-height + mask 渐隐 | `-webkit-line-clamp` 硬截断 | 新增 `.rich-collapsed` |
| 6 | 卡片阴影 `0 1px 3px rgba(0,0,0,.1)` | `0 4px 16px rgba(18,18,18,.08)` | 对齐 |
| 7 | Tab 激活 = 加粗 + 3px 蓝下划线，**不变字色** | 蓝字 + 2px 圆角线 | 对齐 |
| 8 | 焦点环双层 `0 0 0 2px #fff,0 0 0 5px rgba(23,114,246,.3)` | 无 | 新增 `.focus-ring` |
| 9 | 热榜分隔 .5px、排名 18px/宽 20px、热色 `#f77a31` | 自定义 rank 配色 | 对齐 |
| 10 | 圆角主力 3–4px | 大量 8/12/16px | 收敛 |
| 11 | 卡内分段分隔线左右内缩 20px | 通栏 divide | `.card-section` |
| 12 | 过渡 .2s/.3s/.8s，ease-out | .14s/.3s/.5s | 重定三档 |
| 13 | `card-raised` 类被使用但从未定义（首页头像菜单无样式） | — | 补 `.menu-pop` 并修复 |

## 6. 未能取得的部分（诚实标注）

- 首页 `/`（关注流/推荐流）**未登录会 302 到 `/signin`**，本轮没有读到已登录信息流 DOM；`/question/*`、`zhuanlan.zhihu.com` 返回 40362 风控 JSON，正文与运行时计算样式不可读。
- 因此本版的信息流/内容页规格**来自官方生产样式表规则原文**（`.TopstoryItem`/`.ContentItem-*`/`.VoteButton` 等类名与声明均为官方文件内容），而非页面实测截图。布局坐标（列宽 704/405 等）沿用上一版实测值，本轮未复测。
- JS 层交互逻辑（虚拟滚动、埋点、SSR 注水）不在样式表内，未做逆向。
