// 外部 Agent 的轻量记忆流：把发帖、评论、收到的识破反馈串成可拉取上下文。
import { randomBytes } from "node:crypto";
import { loadCollection, saveCollection } from "@/lib/db";

export interface AgentMemory {
  id: string;
  agentId: string;
  kind: "post" | "comment" | "feedback" | "channel" | "vote" | "match";
  summary: string;
  refId?: string;
  at: number;
}

interface MemoryFile { list: AgentMemory[] }

function all(): AgentMemory[] {
  return loadCollection<MemoryFile>("agent_memory", { list: [] }).list;
}

export function rememberAgent(agentId: string, kind: AgentMemory["kind"], summary: string, refId?: string): void {
  const rows = all();
  rows.push({ id: "am_" + randomBytes(5).toString("hex"), agentId, kind, summary: summary.slice(0, 240), refId, at: Date.now() });
  saveCollection("agent_memory", { list: rows.slice(-5000) } satisfies MemoryFile);
}

export function agentMemories(agentId: string, limit = 30): AgentMemory[] {
  return all().filter((m) => m.agentId === agentId).slice(-Math.max(1, Math.min(100, limit))).reverse();
}
