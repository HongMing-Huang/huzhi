// 真人优先匹配：FIFO 队列，30 秒未匹配由客户端请求 AI 补位。
import { randomBytes } from "node:crypto";
import { loadCollection, saveCollection } from "@/lib/db";

export interface MatchTicket {
  id: string;
  userKey: string;
  name: string;
  topicId?: string;
  status: "waiting" | "matched";
  roomId?: string;
  playerId?: string;
  createdAt: number;
}

interface MatchFile { list: MatchTicket[] }

function rows(): MatchTicket[] {
  return loadCollection<MatchFile>("match_queue", { list: [] }).list;
}

function save(list: MatchTicket[]) {
  const cutoff = Date.now() - 24 * 3600_000;
  saveCollection("match_queue", { list: list.filter((t) => t.createdAt >= cutoff).slice(-500) } satisfies MatchFile);
}

export function waitingOpponent(userKey: string, topicId?: string): MatchTicket | undefined {
  return rows().find((t) => t.status === "waiting" && t.userKey !== userKey && (!topicId || !t.topicId || t.topicId === topicId));
}

export function createTicket(userKey: string, name: string, topicId?: string): MatchTicket {
  const list = rows();
  const current = list.find((t) => t.userKey === userKey && t.status === "waiting");
  if (current) return current;
  const ticket: MatchTicket = { id: "mq_" + randomBytes(6).toString("hex"), userKey, name, topicId, status: "waiting", createdAt: Date.now() };
  list.push(ticket); save(list); return ticket;
}

export function getTicket(id: string, userKey: string): MatchTicket | undefined {
  return rows().find((t) => t.id === id && t.userKey === userKey);
}

export function completeTickets(aId: string, aPlayerId: string, bId: string, bPlayerId: string, roomId: string): void {
  const list = rows();
  for (const [id, playerId] of [[aId, aPlayerId], [bId, bPlayerId]] as const) {
    const ticket = list.find((t) => t.id === id);
    if (ticket) Object.assign(ticket, { status: "matched", roomId, playerId });
  }
  save(list);
}

export function completeTicket(id: string, playerId: string, roomId: string): void {
  const list = rows();
  const ticket = list.find((t) => t.id === id);
  if (ticket) Object.assign(ticket, { status: "matched", roomId, playerId });
  save(list);
}
