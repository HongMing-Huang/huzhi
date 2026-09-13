// 信息流共识池：登录用户每帖只能判断一次；结果按“下注前的群体共识”给逆向奖励。
// 这是轻量 pari-mutuel：每次判断向对应池投入 10 个虚拟份额，冷门一侧猜中时赔率更高。
import { loadCollection, saveCollection } from "@/lib/db";

export type ConsensusPick = "ai" | "human";

export interface ConsensusGuess {
  postId: string;
  userKey: string;
  pick: ConsensusPick;
  correct: boolean;
  authorName: string;
  evoVersion?: number;
  at: number;
}

interface ConsensusFile { list: ConsensusGuess[] }

function all(): ConsensusGuess[] {
  return loadCollection<ConsensusFile>("feed_consensus", { list: [] }).list;
}

function save(list: ConsensusGuess[]) {
  saveCollection("feed_consensus", { list: list.slice(-10000) } satisfies ConsensusFile);
}

export function hasConsensusGuess(postId: string, userKey: string): boolean {
  return all().some((g) => g.postId === postId && g.userKey === userKey);
}

export function consensusFor(postId: string): { ai: number; human: number; total: number; aiPercent: number } {
  // 只有登录账户进入公共共识池；游客记录仅用于防重复与产品分析。
  const rows = all().filter((g) => g.postId === postId && g.userKey.startsWith("user:"));
  const ai = rows.filter((g) => g.pick === "ai").length;
  const human = rows.length - ai;
  return { ai, human, total: rows.length, aiPercent: rows.length ? Math.round((ai / rows.length) * 100) : 50 };
}

/** 下注前赔率；两侧各有 2 份种子流动性，避免首位玩家获得极端奖励。 */
export function oddsFor(postId: string, pick: ConsensusPick): number {
  const c = consensusFor(postId);
  const same = (pick === "ai" ? c.ai : c.human) + 2;
  const opposite = (pick === "ai" ? c.human : c.ai) + 2;
  return Math.min(3, Number((1 + opposite / same).toFixed(2)));
}

/** 越早提交正确判断，越少能借用群体共识，因此奖励纯观察力。 */
export function timingBonusFor(postId: string): number {
  const total = consensusFor(postId).total;
  if (total < 5) return 10;
  if (total < 15) return 5;
  return 0;
}

export function recordConsensusGuess(row: ConsensusGuess): void {
  const list = all();
  list.push(row);
  save(list);
}

export function evolutionBuckets(authorName: string): { version: number; guesses: number; caught: number; caughtRate: number }[] {
  const rows = all().filter((g) => g.authorName === authorName && g.evoVersion);
  const buckets = new Map<number, { guesses: number; caught: number }>();
  for (const row of rows) {
    const version = row.evoVersion ?? 1;
    const b = buckets.get(version) ?? { guesses: 0, caught: 0 };
    b.guesses += 1;
    if (row.correct && row.pick === "ai") b.caught += 1;
    buckets.set(version, b);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([version, b]) => ({
    version,
    ...b,
    caughtRate: b.guesses ? Math.round((b.caught / b.guesses) * 100) : 0,
  }));
}
