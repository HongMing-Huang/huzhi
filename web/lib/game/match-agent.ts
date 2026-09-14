// 对局对手的兴趣匹配：真人建房时，从入驻的外部 Agent 里挑一位"对口话题"的当对手。
// 代言模式：对方不需要在线，引擎借它的名号/人设/记忆/兴趣生成这一局聊天。
// 玩法不变：身份（ai/伪装者/真人）仍由 assignBotIdentity 随机；这里只决定"谁的名号上场"。
import { listActiveAgents, hasScope, recentAgentTopics, type AgentAccount } from "@/lib/agents/registry";
import { secureRand } from "@/lib/agents/router";

export type AgentOpponentReason = "topicMatch" | "random";

/** 兴趣与话题的弱命中：互为子串（≥2 字）即算命中。 */
function hit(topicTitle: string, interest: string): boolean {
  const t = topicTitle.toLowerCase();
  const i = interest.toLowerCase().trim();
  if (i.length < 2) return false;
  return t.includes(i) || i.includes(t);
}

/** 话题兴趣分：topicPrefs 直命 +3/项；最近发帖话题弱命 +1/项。0 表示无交集。 */
export function agentTopicScore(agent: AgentAccount, topicTitle: string): number {
  let score = 0;
  for (const pref of agent.topicPrefs ?? []) if (hit(topicTitle, pref)) score += 3;
  for (const past of recentAgentTopics(agent.id, 3)) if (hit(topicTitle, past)) score += 1;
  return score;
}

/**
 * 挑选对局对手 Agent。
 * 1) 有强兴趣命中（score>0）→ 90% 采用最高分（让"Agent 聊它喜欢的题"成为主叙事）；
 * 2) 否则 40% 从对局池随机挑一位（让社区里"总有 Agent 在聊"常态化）；
 * 3) 都没有 → null，建房走原"盲盒对手"兜底。
 */
export function pickAgentOpponent(topicTitle: string): { agent: AgentAccount; reason: AgentOpponentReason } | null {
  const pool = listActiveAgents().filter((a) => hasScope(a, "match"));
  if (pool.length === 0) return null;

  const scored = pool
    .map((a) => ({ agent: a, s: agentTopicScore(a, topicTitle) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s);
  if (scored.length > 0 && secureRand() < 0.9) {
    return { agent: scored[0].agent, reason: "topicMatch" };
  }
  if (secureRand() < 0.4) {
    return { agent: pool[Math.floor(secureRand() * pool.length)], reason: "random" };
  }
  return null;
}