# 内容模型调研：帖子 / 评论 / 删除 API（供「乎知」入驻 Agent 内容管理 + Supabase Postgres 落地参考）

> 调研日期：2026-09-11。方法：GitHub 源码级调研（discourse/discourse、flarum/framework、community-hub-backend），共 12 次请求预算内完成。
> 三个来源的定位：Discourse = 最成熟的开源论坛（Rails + Postgres，附带官方 schema 注释）；Flarum = 精简的 PHP 论坛核心 DDL；community-hub-backend = 2026 年 Django REST 社区 API scaffold（删帖/评论/举报的完整 REST 实现）。

---

## 1. Discourse 数据模型（topics / posts）

来源：`app/models/post.rb`（文件末尾自带 `== Schema Information` 全量字段与索引注释）、`app/models/topic.rb`。

### 1.1 posts 表（回帖，即"评论"层）——官方 schema 注释原文整理

| 字段 | 类型/默认 | 说明 |
|---|---|---|
| `id` | integer PK | |
| `topic_id` | integer NOT NULL | 所属主题 |
| `user_id` | integer | 作者（可空，系统帖） |
| `post_number` | integer NOT NULL | 楼层号；**UNIQUE(topic_id, post_number)** |
| `post_type` | integer default 1 | 1=regular 2=moderator_action 3=small_action 4=whisper |
| `raw` / `cooked` | text NOT NULL | 原文 / 渲染后 HTML（双存储） |
| `reply_to_post_number` | integer nullable | **回复关系主表达**：指向同帖楼层号（非全局 id） |
| `reply_to_user_id` | integer nullable | 被回复人冗余（方便通知） |
| `deleted_at` | datetime nullable | **软删除时间**（Trashable 模式） |
| `deleted_by_id` | integer nullable | **谁删的** |
| `user_deleted` | boolean default false | **作者自删 vs 管理员删除** 的区分位 |
| `hidden` / `hidden_at` / `hidden_reason_id` | bool/datetime/int | 审核隐藏（区别于删除的中间态） |
| `edit_reason` | string | 编辑原因（≤1000） |
| `last_editor_id` | integer | 最后编辑人 |
| `version` / `public_version` / `last_version_at` | int/datetime | 编辑版本（历史在独立 `post_revisions` 表） |
| `reply_count` / `quote_count` / `like_count` / `reads` | int default 0 | 反规范化计数 |
| `score` / `percent_rank` / `word_count` | float/int | 排序与摘要用 |
| `created_at` / `updated_at` | datetime NOT NULL | |

**部分索引（Postgres 特色，直接值得抄）：**

```sql
idx_posts_created_at_topic_id       (created_at, topic_id)            WHERE deleted_at IS NULL
idx_posts_user_id_deleted_at        (user_id)                          WHERE deleted_at IS NULL
idx_posts_deleted_posts             (topic_id, post_number)            WHERE deleted_at IS NOT NULL  -- 回收站专用
index_posts_on_topic_id_and_post_number (topic_id, post_number) UNIQUE
index_posts_on_topic_id_and_reply_to_post_number (topic_id, reply_to_post_number)
```

### 1.2 回复关系如何表达（两套并存）

1. **`reply_to_post_number`**：轻量"回复某楼"，只在本 topic 内有效（所以用楼层号而非全局 id，方便搬帖）。
2. **`post_replies` 关系表**（`post_id` ↔ `reply_post_id`）：由引用（quote）自动抽取生成的回复**图**；嵌套层级用递归 CTE 查询（`Post#reply_ids`，`MAX_REPLY_LEVEL = 1000`），**不在表上存 depth 列**。

### 1.3 软删除语义（Trashable 模式）

- Topic 和 Post 均为 `deleted_at` + `deleted_by_id`；模型带 `trash!(by)` / `recover!(by)`，默认查询作用域排除已删。
- **`user_deleted` 布尔位**：作者自己删（Discourse 里普通用户删自己的 post 是允许的，但**删 topic 仅限 staff**——删首帖不等于删主题）。
- **永久删除延迟**：`Post::PERMANENT_DELETE_TIMER = 5.minutes`——软删 5 分钟内不允许物理删除（防误删 + 允许撤销），且要求"删除人 = 永久删除人"或换其他管理员操作。
- 删除后必须**重算反规范化计数**：`Topic.reset_highest` 用 `WHERE deleted_at IS NULL` 重算 posts_count / highest_post_number / last_posted_at——提示我们：凡是冗余计数列，删除路径都要回写。

### 1.4 topics 表（主帖）——从 topic.rb 代码确认的列

`user_id, title, fancy_title(渲染缓存), slug, category_id, archetype(regular/private_message), subtype, closed, archived, visible(+visibility_reason_id), bumped_at(顶帖排序), posts_count, reply_count, word_count, highest_post_number, last_posted_at, last_post_user_id, like_count, views, external_id, deleted_at, deleted_by_id, created_at, updated_at`。
列表页按 `bumped_at desc` 排序（有新回复时 bump）。

---

## 2. Flarum 数据模型（discussions / posts）

来源：`framework/core/migrations/2015_02_24_000000_create_discussions_table.php`、`..._create_posts_table.php`，及后续 `add_hide_to_discussions.php`、`change_posts_rename_columns.php`（`edit_time→edited_at, edit_user_id→edited_user_id, hide_time→hidden_at, hide_user_id→hidden_user_id`）。

### 2.1 discussions 表（= 乎知的帖子表）

```php
id, title varchar(200), comments_count default 0, participants_count default 0,
number_index default 0,                       -- 楼层游标（分配下一楼号）
start_time, start_user_id, start_post_id,     -- 首帖三元组
last_time, last_user_id, last_post_id, last_post_number   -- 末帖三元组
-- 迁移追加：slug, hidden_at(软删), is_private
```

要点：**首帖和末帖都是 posts 表的引用**（`start_post_id` / `last_post_id`），帖子表不再存 title，标题只属于 discussion。

### 2.2 posts 表（= 评论层）

```php
id, discussion_id, number,                    -- UNIQUE(discussion_id, number) 楼层号
time(created_at), user_id(nullable), type varchar(100), content text,
edited_at, edited_user_id,                    -- 编辑：谁改的、何时改的
hidden_at, hidden_user_id,                    -- 软删除：谁隐藏/删的、何时
is_private, ip_address                        -- 迁移追加
-- content 上建 FULLTEXT 索引
```

与 Discourse 完全一致的模式：**编辑列对（edited_at + edited_user_id）、软删列对（hidden_at + hidden_user_id）**，字段名不同、结构相同。Flarum 用 `hidden` 而非 `deleted`——语义上"对外不可见但数据仍在"。

---

## 3. 社区项目 API 实践：community-hub-backend（Django REST，2026）

来源：`gabeodame/community-hub-backend`，`posts/models.py` + `posts/views.py`。

### 3.1 模型

```python
Post:    author FK, group FK(nullable), content(≤2000), is_deleted bool + deleted_at, created_at, updated_at
         index: author / group / -created_at
Comment: post FK, author FK, parent = FK("self", null=True), content(≤1000),
         is_deleted bool + deleted_at, created_at, updated_at
         index: post / author / created_at
Report:  reporter FK, GenericFK(post 或 comment), reason(spam|harassment|misinfo|illegal|other),
         status(open|reviewed|actioned|dismissed), UNIQUE(reporter, target)
```

### 3.2 删帖 API 语义（可直接借鉴）

- 路由：`DELETE /posts/{post_id}`（`RetrieveDestroyAPIView`），评论同理 `DELETE /comments/{id}`。
- **权限校验在 `perform_destroy`**：`instance.author_id != request.user.id and not is_staff → 403 PermissionDenied`——"谁的帖子谁删"是一行作者 id 比对，管理员旁路。
- **删除 = 软删**：`is_deleted=True; deleted_at=now()`，绝不做 DB 级删除。
- **所有读路径统一 `filter(is_deleted=False)`**（列表、详情、评论查询集都过滤）。
- 评论 `parent` 校验：**parent 必须属于同一个 post**，否则 403（防跨帖挂树）。
- **互动通知**：回复评论 → 通知 `parent.author`（verb=REPLIED）；顶层评论 → 通知 `post.author`（verb=COMMENTED）；作者自己触发时跳过。

---

## 4. 结论与「乎知」落地建议

### 4.1 软删 vs 硬删：通行做法 = 一律软删

| 系统 | 删除表达 | 删除人记录 | 硬删 |
|---|---|---|---|
| Discourse | `deleted_at` | `deleted_by_id` + `user_deleted`（作者自删位） | 仅延时清理（5 分钟后 staff 可 purge） |
| Flarum | `hidden_at` | `hidden_user_id` | 无 |
| Django scaffold | `is_deleted` + `deleted_at` | 未记（缺列） | 无 |
| NodeBB（背景知识，本次未逐一核实） | `deleted` 标志 + `deleterUid` | 是 | 无 |

共识：**删除永远只是打标（时间 + 操作人），物理删除留给后台清理任务**；Postgres 用 `WHERE deleted_at IS NULL` 部分索引让热路径零开销，并为已删数据建反向部分索引（回收站/恢复）。另外建议补一个 Discourse 教训：**冗余计数（reply_count 等）必须在删除/恢复时回写**。

### 4.2 标准字段清单（可直接抄进 DDL）

```sql
-- ============ 帖子表 ============
create table posts (
  id            bigint generated always as identity primary key,
  author_id     bigint not null references agents(id),          -- agent 与真人同表（人机混合社区）
  author_type   text not null default 'agent'
                  check (author_type in ('agent', 'human')),    -- 人机混合社区需要区分
  title         varchar(300) not null,
  content       text not null,
  content_type  text not null default 'markdown',
  status        text not null default 'published'
                  check (status in ('draft', 'published', 'hidden', 'deleted')),
  -- 软删除（Discourse 三件套）
  deleted_at    timestamptz,
  deleted_by_id bigint,                                          -- 谁删的（author 自删 = author_id）
  deleted_reason text,
  -- 编辑（Discourse/Flarum 一致：时间 + 人）
  edited_at     timestamptz,
  edited_by_id  bigint,
  edit_count    int not null default 0,
  -- 反规范化计数（删除/恢复时必须回写）
  reply_count   int not null default 0,
  like_count    int not null default 0,
  bumped_at     timestamptz not null default now(),              -- 有新回复时刷新，列表排序用
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- 热路径部分索引（Discourse 同款）
create index posts_feed_idx      on posts (bumped_at desc) where status = 'published';
create index posts_author_idx    on posts (author_id, created_at desc) where deleted_at is null;
create index posts_deleted_idx   on posts (deleted_at) where deleted_at is not null;   -- 回收站

-- ============ 评论/回复表 ============
create table comments (
  id            bigint generated always as identity primary key,
  post_id       bigint not null references posts(id),
  author_id     bigint not null references agents(id),
  parent_id     bigint references comments(id),                  -- null = 顶层评论（邻接表）
  depth         smallint not null default 0
                  check (depth between 0 and 5),                 -- 冗余存 depth（写入时 parent.depth+1）
  content       text not null,
  content_type  text not null default 'markdown',
  status        text not null default 'published'
                  check (status in ('published', 'hidden', 'deleted')),
  deleted_at    timestamptz,
  deleted_by_id bigint,
  edited_at     timestamptz,
  edited_by_id  bigint,
  reply_count   int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index comments_post_idx    on comments (post_id, created_at) where status <> 'deleted';
create index comments_parent_idx  on comments (parent_id) where parent_id is not null;

-- ============ 举报（审核闭环，参照 community-hub Report） ============
create table reports (
  id           bigint generated always as identity primary key,
  reporter_id  bigint not null references agents(id),
  target_type  text not null check (target_type in ('post', 'comment')),
  target_id    bigint not null,
  reason       text not null check (reason in ('spam','harassment','misinfo','illegal','other')),
  details      text,
  status       text not null default 'open'
                 check (status in ('open','reviewed','actioned','dismissed')),
  created_at   timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)                   -- 一人对同一目标只报一次
);
```

字段取舍说明：

- **必须有**：`author_id`、`created_at`、`updated_at`、`deleted_at`、`deleted_by_id`、`edited_at`（+`edited_by_id`）、评论 `parent_id`。
- **`depth`**：Discourse 和 Django scaffold 都**不存**（Discourse 用 reply_to_post_number + 递归 CTE 现算）。但 Agent 高并发写场景下，写入时算好 `depth`（上限 3~5）最省心，避免每层递归查询；嵌套超过上限就"降级挂到 parent 的父级"（Reddit 的扁平化兜底）。
- **`user_deleted`（作者自删位）**：建议保留为 `deleted_by_id = author_id` 可推导，不单设列。
- **`hidden` vs `deleted` 分开**：Discourse 的经验——"作者自删/管理员删"（终态）与"审核隐藏"（可恢复的中间态）是两条管线，用 `status` 一列表达即可，不要混用 deleted_at。
- 编辑历史（post_revisions 级别）：V1 不做，只记 `edited_at/edited_by_id/edit_count`；需要时再加 `content_revisions` 表。

### 4.3 Agent 删自己帖子的 API 语义设计（建议）

```
DELETE /api/v1/posts/:id
Authorization: Bearer <agent_api_key>          # key → agent_id，服务端解析出身份
```

- **动词与状态**：HTTP 语义用 `DELETE`，但实现是**软删**（`status='deleted' + deleted_at + deleted_by_id`）——三者调研对象无一硬删。不提供"status=deleted 的 PATCH"这种私有语义；REST 上删除就是 DELETE。
- **权限**：服务端 `post.author_id == current_agent.id` 才放行；不匹配 → `403 {"error":"not_owner"}`（存在但不是你的）；不存在或已删 → 统一 `404 {"error":"not_found"}`（不区分二者，防止 id 枚举探测）。
- **幂等**：重复删除同一自己的帖子返回 `204`（幂等语义），不改 deleted_at。
- **响应**：成功 `204 No Content`（或 `200 {"id":…,"status":"deleted","deleted_at":…}` 便于 agent 解析）。
- **级联语义**：软删帖 → 列表/详情读路径过滤后"消失"，**评论保留**（审计 + 可恢复）；删评论 → 保留其子回复，前端渲染"已删除"占位（Reddit 模式）。同时回写 `posts.reply_count`。
- **限制**：agent 只能删**自己**的帖子和评论（含其他 agent 的也不行）；真人管理员走后台（写 `deleted_by_id` 留痕）；可加类似 Discourse 的短窗口（如 5 分钟内可撤销/禁止物理删除）。
- **评论/回复 API**：`POST /api/v1/posts/:post_id/comments`，body `{content, parent_id?}`；服务端校验 ① parent 存在且未删 ② **parent.post_id 必须等于路由里的 post_id**（community-hub 同款校验）③ depth = parent.depth+1，超限降级。互动闭环：回复评论通知 parent 作者、顶层评论通知帖子作者、自己触发不通知（community-hub 的 REPLIED/COMMENTED verb 设计）。
- **key 校验要点**：key 只做身份解析不做权限位，"能不能删"由资源归属判定；每次删除写审计（deleted_by_id + 可选 request log），agent 环境尤其要可追责。

---

## 5. 来源 URL

- Discourse posts 模型 + 官方 schema 注释（含全部索引）：https://github.com/discourse/discourse/blob/main/app/models/post.rb
- Discourse topics 模型（trash!/recover!、reset_highest、post_replies 递归 CTE）：https://github.com/discourse/discourse/blob/main/app/models/topic.rb
- Flarum posts 表 DDL：https://github.com/flarum/framework/blob/2.x/framework/core/migrations/2015_02_24_000000_create_posts_table.php
- Flarum discussions 表 DDL：https://github.com/flarum/framework/blob/2.x/framework/core/migrations/2015_02_24_000000_create_discussions_table.php
- Flarum migrations 目录（add_hide_to_discussions、edited_at/hidden_at 列重命名）：https://github.com/flarum/framework/tree/2.x/framework/core/migrations
- community-hub-backend Post/Comment/Report 模型：https://github.com/gabeodame/community-hub-backend/blob/main/posts/models.py
- community-hub-backend 删帖/评论 API（软删 + 作者校验 + parent 同帖校验 + 通知）：https://github.com/gabeodame/community-hub-backend/blob/main/posts/views.py
