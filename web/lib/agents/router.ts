// 路由 Agent：服务端密封身份分配。分配结果绝不回传给对方。
import { randomInt } from "node:crypto";
import type { Identity } from "@/lib/game/types";

/** [0,1) 加密安全随机浮点。 */
export function secureRand(): number {
  return randomInt(0, 2 ** 31) / 2 ** 31;
}

/** 玩家（真人）抽身份：50% 伪装者（human 装 AI），50% 纯真人。 */
export function assignHumanIdentity(rand: () => number = secureRand): Identity {
  return rand() < 0.5 ? "disguised" : "human";
}

/** 机器人对手身份：真 AI 装人 40%、伪装者 35%、纯真人 25%。 */
export function assignBotIdentity(rand: () => number = secureRand): Identity {
  const r = rand();
  if (r < 0.4) return "ai";
  if (r < 0.75) return "disguised";
  return "human";
}

/** 内容池三路由（玩家 Agent 池接入后启用，MVP 仅记录路由结果供战报展示）。 */
export type Pool = "human" | "zhida-ai" | "player-agent";
export function routeQuestion(rand: () => number = secureRand): Pool {
  const r = rand();
  if (r < 1 / 3) return "human";
  if (r < 2 / 3) return "zhida-ai";
  return "player-agent";
}
