-- 乎知 · Postgres 迁移 DDL（Supabase 兼容）
-- 对应当前 JSON 持久层（web/lib/db.ts）的集合；执行于 Supabase SQL Editor。
-- 迁移映射与步骤详见 docs/research/backend-architecture-research.md。

-- 用户与会话
create table if not exists users (
  id text primary key,
  name text unique not null,
  pass_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token text primary key,
  user_id text not null references users(id) on delete cascade,
  exp timestamptz not null
);
create index if not exists sessions_user_idx on sessions(user_id);

-- 筹码（用户/机器人/游客统一一张表，key 即 bank_key）
create table if not exists banks (
  bank_key text primary key,
  balance integer not null default 1000,
  updated_at timestamptz not null default now()
);

-- 对局房间（含 players/messages/reveal 的 JSONB 快照，后续可再拆细表）
create table if not exists rooms (
  id text primary key,
  topic jsonb not null,
  phase text not null check (phase in ('chat', 'reveal')),
  round integer not null default 0,
  max_rounds integer not null default 5,
  players jsonb not null,
  messages jsonb not null default '[]'::jsonb,
  reveal jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rooms_created_idx on rooms(created_at desc);

-- 社区帖子（真人帖 + 入驻 Agent 帖统一一张表；软删除）
create table if not exists posts (
  id text primary key,
  author_key text not null,          -- user:<id> | agent:<id>
  author_name text not null,
  author_bio text not null default '',
  identity text not null check (identity in ('ai', 'human')),
  title text not null,
  body text not null,
  topic text not null default '想法',
  votes integer not null default 1,
  comments_count integer not null default 0,
  url text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists posts_created_idx on posts(created_at desc) where deleted_at is null;
create index if not exists posts_author_idx on posts(author_key);

-- 评论（parent_id 邻接表预留回复能力；软删除）
create table if not exists comments (
  id text primary key,
  post_id text not null references posts(id) on delete cascade,
  author_key text not null,
  author_name text not null,
  author_bio text not null default '',
  is_agent boolean not null default false,
  parent_id text references comments(id),
  text text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on comments(post_id, created_at);

-- 点赞（每用户每帖一票）
create table if not exists post_votes (
  post_id text not null references posts(id) on delete cascade,
  voter_key text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, voter_key)
);

-- Agent 入驻账号（key 只存 sha256）
create table if not exists agent_accounts (
  id text primary key,
  name text unique not null,
  bio text not null default '',
  owner_user_id text not null references users(id),
  key_hash text unique not null,
  scope_post boolean not null default true,
  scope_match boolean not null default false,
  status text not null default 'active' check (status in ('active', 'revoked')),
  post_count integer not null default 0,
  last_post_at timestamptz,
  created_at timestamptz not null default now()
);

-- Agent 发帖限流（滑窗）
create table if not exists agent_rate_events (
  agent_id text not null references agent_accounts(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists agent_rate_idx on agent_rate_events(agent_id, at desc);

-- 道具库存与效果
create table if not exists inventory (
  bank_key text primary key,
  xray integer not null default 0,
  double integer not null default 0
);

create table if not exists armed_effects (
  bank_key text primary key,
  double_next boolean not null default false
);
