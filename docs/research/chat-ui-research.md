# 现代 AI 聊天界面调研报告 —— 「乎知」1v1 人猜 AI 对局聊天窗口

> 调研日期：2026-09-11。调研对象：vercel/ai-chatbot（现 vercel/chatbot）、lobehub/lobe-chat、ChatGPT 网页版 / 知乎直答。所有结论均标注来源；代码级结论直接读取仓库源码。

---

## 一、结论速览（TL;DR）

1. **现代 AI 聊天的消息行是「非对称布局」**：助手消息 = 左侧头像 + 无气泡全宽正文（像文章段落）；用户消息 = 右对齐浅色气泡、无头像。ChatGPT、vercel/chatbot、lobe-chat、知乎直答全部采用此模式。
2. **Composer 是底部 sticky 圆角卡片**（rounded-2xl ≈ 16px），发送按钮为小圆形/圆角方形箭头按钮，空输入时置灰 disabled，生成中变为 Stop 按钮。
3. **打字指示器**两派：ChatGPT 式「三点跳动 bubble」与 vercel 式「Shimmer 微光文字（正在思考…）」。流式场景推荐 Shimmer 文字，更克制。
4. **自动滚动核心**：底部哨兵元素 + `isAtBottom` 状态（距底 <100px 判定在底部）+ MutationObserver/ResizeObserver 监听内容增长时才滚，用户手动上滑时绝不打扰，并提供「回到底部」悬浮按钮。

---

## 二、消息行（Message Row）标准结构

### 2.1 三家对比

| 维度 | vercel/chatbot | lobe-chat | ChatGPT 网页版 |
|---|---|---|---|
| 助手侧布局 | 头像(28px)+正文横向 `flex items-start gap-3` | 头像+名字+时间为 header 行，正文纵向 `gap:8` | 头像+正文横向 |
| 助手头像 | `size-7 rounded-lg bg-muted/60 ring-1` 内置 13px 图标 | 方形头像（可点击） | 圆形 Logo 头像 |
| 助手气泡 | **无**，正文占满剩余宽度 `flex-1 min-w-0` | **无**（variant 未传 bubble），正文 `width:100%` | **无**，全宽 |
| 用户侧布局 | `flex flex-col items-end gap-2`，无头像 | `align:flex-end`，无头像，`paddingInlineStart:36px` 限制宽度 | 右对齐，无头像 |
| 用户气泡 | `rounded-2xl rounded-br-lg border bg-secondary→muted 渐变 px-3.5 py-2`，`max-w-[min(80%,56ch)]` | `variant="bubble"` 浅色圆角气泡 | 圆角气泡（约 rounded-3xl，深浅主题跟随） |
| 名字+时间 | 不展示（极简派） | **header 行展示**：`名字 + 时间`，用户侧 reverse 排列 | 不展示 |
| 消息间距 | 列表 `gap-5`(20px) / md `gap-7`(28px) | 行内 `gap:8`，条目 `paddingBlock:8` | 约 24px |
| 消息操作 | hover 显示（复制/点赞），`group/message` | Actions 行在正文下方 | hover 显示（复制/重新生成/朗读） |

来源：
- vercel/chatbot `components/chat/message.tsx`（用户气泡类名原文见 2.2）
- lobe-chat `src/features/Conversation/ChatItem/ChatItem.tsx`（header/body/chips 结构原文见 2.2）
- ChatGPT 布局特征：[assistant-ui ChatGPT 复刻示例](https://www.assistant-ui.com/examples/chatgpt)、[Setproduct: Designing AI Chat Interfaces](https://www.setproduct.com/blog/ai-chat-interface-ui-design)（"bubbles 适合窄侧栏助手，宽版面助手用全宽排版/底色区分"）

### 2.2 关键源码摘录（可照抄的类名/结构）

**vercel/chatbot 用户消息气泡**（`components/chat/message.tsx`）：

```
w-fit max-w-[min(80%,56ch)] overflow-hidden break-words
rounded-2xl rounded-br-lg
border border-border/30 bg-gradient-to-br from-secondary to-muted
px-3.5 py-2 shadow-[var(--shadow-card)]
```

助手消息行：

```
<div class="flex items-start gap-3">            // 头像 + 正文
  <div class="size-7 rounded-lg bg-muted/60 ring-1 ring-border/50">icon</div>
  <div class="flex min-w-0 flex-1 flex-col gap-2">正文(text-[13px] leading-[1.65]) + actions</div>
</div>
```

用户消息整行附加入场动画：`animate-[fade-up_0.25s_cubic-bezier(0.22,1,0.36,1)]`。

**lobe-chat ChatItem 结构**（`src/features/Conversation/ChatItem/ChatItem.tsx`）：

```
message-wrapper (column, gap:8, paddingBlock:8, 用户侧 paddingInlineStart:36)
├─ message-header (horizontal / 用户侧 horizontal-reverse, gap:8)
│   ├─ Avatar (square)
│   └─ Title (名字 + 时间 + titleAddon)
├─ message-body (maxWidth:100%, gap:8; 用户 variant="bubble"，助手 width:100%)
│   ├─ aboveMessage / MessageContent / belowMessage
├─ FollowUpChips          // 追问 chips 直接挂在消息条目下
└─ Actions (复制/重新生成等)
```

### 2.3 「乎知」浅色知乎风适配规范（可直接照抄）

整体：内容列 `max-w-3xl(768px) mx-auto px-4`；消息条目间距 `space-y-5`（20px）；列表底部留 `pb-6`。

**AI（被猜方/出题方）消息行 —— 全宽无气泡：**

```html
<div class="flex items-start gap-3">                     <!-- gap 12px -->
  <!-- 头像 28px，知乎蓝 -->
  <div class="mt-0.5 flex size-7 shrink-0 items-center justify-center
              rounded-lg bg-[#0066FF]/10 ring-1 ring-[#0066FF]/20">
    <BotIcon class="size-4 text-[#0066FF]" />
  </div>
  <div class="min-w-0 flex-1">
    <!-- 名字+时间行：仅首条或需要时展示 -->
    <div class="mb-1 flex items-baseline gap-2">
      <span class="text-[13px] font-medium text-[#1A1A1A]">AI 玩家</span>
      <span class="text-[12px] text-[#999999]">14:32</span>
    </div>
    <!-- 正文：无气泡，15px/1.65，知乎正文规格 -->
    <p class="whitespace-pre-wrap break-words text-[15px] leading-[1.7] text-[#1A1A1A]">
      消息正文…
    </p>
  </div>
</div>
```

**用户消息行 —— 右对齐浅灰气泡：**

```html
<div class="flex flex-col items-end gap-1 animate-[fade-up_.25s_cubic-bezier(.22,1,.36,1)]">
  <div class="max-w-[75%] w-fit break-words rounded-2xl rounded-br-md
              bg-[#F2F2F2] px-3.5 py-2
              text-[15px] leading-[1.7] text-[#1A1A1A]">
    我猜这条是 AI 写的！
  </div>
  <!-- 可选：时间戳 12px #999 -->
</div>
```

要点：用户气泡右下角收小角（`rounded-br-md`）暗示方向；AI 侧不使用气泡，长回答可容纳 Markdown 列表/引用。知乎直答同为「用户右侧气泡 + AI 全宽排版 + 底部 composer」（本条基于产品常识归纳，本次未抓取其页面源码验证）。

---

## 三、Composer 输入区标准设计

### 3.1 vercel/chatbot 的 Composer（components/chat/multimodal-input.tsx + ai-elements/prompt-input）

- 外层卡片：`rounded-2xl border border-border/30 bg-card/70 shadow-[var(--shadow-composer)]`，聚焦时切到 `shadow-composer-focus`（阴影代替 ring，更柔和）。
- 多行 textarea：`min-h-24(96px) px-4 pt-3.5 pb-1.5 text-[13px] leading-relaxed placeholder:text-muted-foreground/35`，自动长高。
- 底部工具行 `px-3 pb-3`：左侧附件/模型按钮（`h-7 w-7 rounded-lg`），右侧发送按钮。
- **发送按钮** `h-7 w-7 rounded-xl`，箭头向上图标：
  - 可用态：`bg-foreground text-background hover:opacity-85 active:scale-95`（按压微缩）
  - 禁用态：`bg-muted text-muted-foreground/25 cursor-not-allowed`
  - `status === "submitted"` 时整个替换为 **StopButton**（同尺寸，Stop 图标）。
- 快捷 chips（SuggestedActions）放在 **composer 上方**，仅空会话时展示。
- 桌面端挂载后 100ms 自动 focus；草稿写入 localStorage 防丢失。
- Enter 发送、Shift+Enter 换行；上传中禁发。

### 3.2 「乎知」Composer 规范

```html
<!-- sticky 底部，背景用渐变遮罩让消息自然淡出 -->
<div class="sticky bottom-0 bg-gradient-to-t from-white via-white to-transparent pt-2 pb-3">
  <!-- 快捷追问 chips：composer 上方，仅等待提问时展示 -->
  <div class="mb-2 flex flex-wrap gap-2">
    <button class="rounded-full border border-[#D3D3D3] bg-white px-3 py-1.5
                   text-[13px] text-[#444444] hover:bg-[#F6F6F6]">
      再来一条更难的
    </button>
  </div>

  <div class="flex items-end gap-2 rounded-2xl border border-[#EBEBEB] bg-white
              px-3 py-2 shadow-[0_2px_10px_rgba(0,0,0,0.06)]
              focus-within:border-[#0066FF]/40 focus-within:shadow-[0_2px_16px_rgba(0,102,255,0.12)]">
    <textarea class="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent
                     px-1 py-1.5 text-[15px] leading-[1.6] text-[#1A1A1A]
                     placeholder:text-[#999999]/60 focus:outline-none"
              placeholder="输入你的问题或猜测…" rows="1" />
    <button class="mb-0.5 flex size-8 shrink-0 items-center justify-center
                   rounded-full transition-all
                   enabled:bg-[#0066FF] enabled:text-white enabled:hover:opacity-90
                   enabled:active:scale-95
                   disabled:bg-[#F2F2F2] disabled:text-[#999999]/50 disabled:cursor-not-allowed">
      <ArrowUpIcon class="size-4" />
    </button>
  </div>
  <p class="mt-1.5 text-center text-[12px] text-[#999999]">AI 生成中请稍候 · Enter 发送</p>
</div>
```

规则：输入为空或对方回合未结束时 disabled；生成中发送钮替换为方形 Stop 钮（`rounded-lg bg-[#1A1A1A] text-white`）。

---

## 四、打字中指示器（Typing Indicator）主流做法

| 方案 | 做法 | 适用 | 来源 |
|---|---|---|---|
| 三点跳动 | 3 个 6px 圆点，`animation-delay: 0/.15/.3s` 依次弹跳 | 经典 IM 感 | [DEPT: How to break away from the standard ChatGPT interface](https://engineering.deptagency.com/how-to-break-away-from-the-standard-chatgpt-interface)（描述 ChatGPT 的 animated bubble 指示器） |
| Shimmer 微光文字 | 「正在思考…」文字上扫过高光，占位高度与正文行高一致 `min-h-[calc(13px*1.65)]` | 流式 AI 回答等待期 | vercel/chatbot `message.tsx` 的 `WaitingText`（Shimmer duration=1s） |
| 三段式状态 | submitted→ThinkingMessage 占位行；streaming→正文逐字出现 | 全流程 | vercel/chatbot `messages.tsx`：`status==="submitted" && 末条非assistant` 时插入 `ThinkingMessage` |

「乎知」建议：AI 出题/作答等待期用 Shimmer 文字（"AI 正在输入…" 或轮次文案"AI 正在写第 2 条回答…"），右侧用户侧不需要指示器；头像行与正文行高对齐（`h-[calc(15px*1.7)]`），避免出现内容时跳动。

---

## 五、自动滚动到底部实现要点

照抄 vercel/chatbot `hooks/use-scroll-to-bottom.tsx` 的模式，四个核心点：

1. **哨兵 + 阈值判定**：滚动容器底部放 `<div ref={endRef} class="min-h-[24px]">`；`isAtBottom = scrollTop + clientHeight >= scrollHeight - 100`（100px 容差，避免亚像素误判）。
2. **只在"本来就贴底"时跟随**：用 `isAtBottomRef`（同步 ref，绕过闭包）记录；用户一旦向上滚动（scroll 事件触发，150ms 防抖判定 `isUserScrollingRef=false`），流式内容增长**不**再自动拉底——这是"不打扰阅读"的关键。
3. **监听内容增长而非消息数组**：`MutationObserver(characterData/childList/subtree)` + `ResizeObserver`（容器与每个子元素），流式 token 逐字追加（characterData 变化）也能触发；回调里 `requestAnimationFrame(() => container.scrollTo({ behavior: "instant", top: scrollHeight }))`。
4. **显式回底按钮**：右下/底部居中悬浮 pill（`rounded-full border bg-card/90 backdrop-blur px-3.5 h-7 shadow-float`），`isAtBottom ? opacity-0 scale-90 pointer-events-none : opacity-100`，点击 `scrollToBottom("smooth")`。

补充：切换对局（chatId 变化）时 `reset()` 重置状态；消息列表容器加 `touch-pan-y overflow-y-auto`，并预留 `overscroll-behavior: contain` 防止移动端穿透。

---

## 六、1v1「人猜 AI」对局的特殊建议

- 每轮把「第 N 条 / 共 5 条 + 倒计时」做成**居中分隔线 chip**（`text-[12px] text-[#999]`，两侧细线），插在消息流中，比侧栏进度条更聚焦。
- 猜测动作可用快捷 chips：「像人写的」「像 AI 写的」双按钮固定在 composer 上方，点击即发送，降低输入成本。
- 判定结果行（对/错）用知乎蓝 `#0066FF`（对）与 `#F5222D`（错）的小标签，不做全屏打断。

---

## 七、可借鉴的开源组件清单

1. **vercel/chatbot**（`components/chat/`：message.tsx、messages.tsx、multimodal-input.tsx、suggested-actions.tsx；`hooks/use-scroll-to-bottom.tsx`）— 最完整的 Next.js + AI SDK 参考实现，类名可直接抄。
   https://github.com/vercel/chatbot/tree/main/components/chat
2. **vercel/ai-elements**（chatbot 同团队的 AI SDK UI 原语库：PromptInput/Response/Shimmer/Tool 等，shadcn 风格可复制源码）— composer 与流式正文的现成积木。
   https://ai-sdk.dev/docs/ai-elements/overview （npm: `ai-elements`）
3. **lobehub/lobe-chat**（`src/features/Conversation/`：ChatItem 完整消息行解剖、FollowUp 追问 chips、ChatInput）— 带名字/时间戳/头像的富消息行与追问 chips 最佳参考。
   https://github.com/lobehub/lobe-chat/tree/canary/src/features/Conversation

备选：[assistant-ui](https://www.assistant-ui.com/examples/chatgpt)（内置 ChatGPT 风格主题，可对照像素级复刻）。

---

## 八、全部来源 URL

- https://github.com/vercel/chatbot/blob/main/components/chat/message.tsx （消息行/气泡/WaitingText）
- https://github.com/vercel/chatbot/blob/main/components/chat/messages.tsx （列表/回底按钮）
- https://github.com/vercel/chatbot/blob/main/components/chat/multimodal-input.tsx （composer/发送/Stop/建议操作）
- https://github.com/vercel/chatbot/blob/main/hooks/use-scroll-to-bottom.tsx
- https://github.com/vercel/chatbot/blob/main/hooks/use-messages.tsx
- https://github.com/lobehub/lobe-chat/blob/canary/src/features/Conversation/ChatItem/ChatItem.tsx
- https://github.com/lobehub/lobe-chat/tree/canary/src/features/Conversation （ChatInput/FollowUp 等）
- https://www.assistant-ui.com/examples/chatgpt （ChatGPT 布局复刻：用户右气泡/助手全宽/底部 composer）
- https://www.setproduct.com/blog/ai-chat-interface-ui-design （AI 聊天界面解剖：气泡 vs 全宽的取舍）
- https://engineering.deptagency.com/how-to-break-away-from-the-standard-chatgpt-interface （ChatGPT 打字指示器描述）
- https://uxdesign.cc/the-chat-box-isnt-a-ui-paradigm-it-s-what-shipped-96e931d92769 （聊天框布局范式分析）
