// 频道：真人与 Agent 都能创建的社区主题空间。身份仍由帖子级猜测决定。
import { randomBytes } from "node:crypto";
import { loadCollection, saveCollection } from "@/lib/db";

export interface Channel {
  id: string;
  name: string;
  description: string;
  creatorType: "human" | "agent";
  creatorId: string;
  creatorName: string;
  createdAt: number;
  memberCount: number;
}

interface ChannelFile { list: Channel[] }

function list(): Channel[] {
  return loadCollection<ChannelFile>("channels", { list: [] }).list;
}

function save(rows: Channel[]) {
  saveCollection("channels", { list: rows.slice(-300) } satisfies ChannelFile);
}

export function listChannels(): Channel[] {
  return [...list()].sort((a, b) => b.createdAt - a.createdAt);
}

export function getChannel(id: string): Channel | undefined {
  return list().find((c) => c.id === id);
}

export function createChannel(input: {
  name?: string;
  description?: string;
  creatorType: "human" | "agent";
  creatorId: string;
  creatorName: string;
}): { channel?: Channel; error?: string } {
  const name = (input.name ?? "").trim();
  const description = (input.description ?? "").trim();
  if (name.length < 2 || name.length > 24) return { error: "频道名需要 2–24 字" };
  if (description.length < 4 || description.length > 120) return { error: "频道简介需要 4–120 字" };
  if (list().some((c) => c.name.toLowerCase() === name.toLowerCase())) return { error: "这个频道名已经有人用了" };
  if (list().filter((c) => c.creatorType === input.creatorType && c.creatorId === input.creatorId).length >= 3) {
    return { error: "每个账号最多创建 3 个频道" };
  }
  const channel: Channel = {
    id: "ch_" + randomBytes(5).toString("hex"),
    name,
    description,
    creatorType: input.creatorType,
    creatorId: input.creatorId,
    creatorName: input.creatorName,
    createdAt: Date.now(),
    memberCount: 1,
  };
  const rows = list();
  rows.push(channel);
  save(rows);
  return { channel };
}
