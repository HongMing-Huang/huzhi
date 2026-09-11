// 赌桌筹码结算。胜负由确定性逻辑判定，LLM 不参与裁决（调研报告风险项 #4）。
import type { Player, RevealEntry, Room } from "./types";

export const SCORE = {
  catchDisguised: 80, // 识破伪装者
  catchAI: 30, // 识破纯 AI
  catchHuman: 10, // 猜中纯真人
  miscall: -20, // 误判
  surviveDisguise: 50, // 伪装者整场未被识破
  streakBonus: 100, // 连续 3 场未破（跨局，暂记设计）
} as const;

export const BET_STEPS = [50, 200] as const;

/** 结算单局。直接把结果写进 room.reveal，并返回每人积分变动。 */
export function settle(room: Room): Record<string, number> {
  const [a, b] = room.players;
  const changes: Record<string, number> = { [a.id]: 0, [b.id]: 0 };

  const entryFor = (self: Player, opp: Player): RevealEntry => {
    const notes: string[] = [];
    let points = 0;
    let guessCorrect = false;

    if (self.guess) {
      if (self.guess.kind === opp.identity) {
        guessCorrect = true;
        const gain =
          opp.identity === "disguised"
            ? SCORE.catchDisguised
            : opp.identity === "ai"
              ? SCORE.catchAI
              : SCORE.catchHuman;
        points += gain;
        notes.push(`猜中对方身份（${label(opp.identity)}）+${gain}`);
      } else {
        points += SCORE.miscall;
        notes.push(`误判对方为「${label(self.guess.kind)}」${SCORE.miscall}`);
      }
    } else {
      notes.push("未提交猜测，不结算猜身份分");
    }

    // 伪装生存奖：我是伪装者且对面没猜中 disguised
    if (self.identity === "disguised" && room.round >= 2 && opp.guess?.kind !== "disguised") {
      points += SCORE.surviveDisguise;
      notes.push(`伪装成功，全场未被识破 +${SCORE.surviveDisguise}`);
    }
    return {
      playerId: self.id,
      name: self.name,
      identity: self.identity,
      guessed: self.guess?.kind,
      bet: self.guess?.bet,
      guessCorrect,
      points,
      notes,
    };
  };

  const ea = entryFor(a, b);
  const eb = entryFor(b, a);

  // 赌桌：赢家通吃注池。双对→退注；双错→注金充公；一对→通吃。
  // 注池盈亏直接并入 entry.points，保证卡片数字与战报总变动口径一致。
  if (a.guess && b.guess) {
    const aRight = a.guess.kind === b.identity;
    const bRight = b.guess.kind === a.identity;
    if (aRight && !bRight) {
      ea.points += b.guess.bet;
      eb.points -= b.guess.bet;
      ea.notes.push(`赢下注池 +${b.guess.bet}`);
      eb.notes.push(`注金被通吃 -${b.guess.bet}`);
    } else if (bRight && !aRight) {
      eb.points += a.guess.bet;
      ea.points -= a.guess.bet;
      eb.notes.push(`赢下注池 +${a.guess.bet}`);
      ea.notes.push(`注金被通吃 -${a.guess.bet}`);
    } else if (!aRight && !bRight) {
      ea.points -= a.guess.bet;
      eb.points -= b.guess.bet;
      ea.notes.push(`双误判，注金充公 -${a.guess.bet}`);
      eb.notes.push(`双误判，注金充公 -${b.guess.bet}`);
    } else {
      ea.notes.push("双方都猜中，退注");
      eb.notes.push("双方都猜中，退注");
    }
  }

  changes[a.id] = ea.points;
  changes[b.id] = eb.points;

  const report = [
    `【战报】话题：${room.topic.title}`,
    `${a.name} 实为「${label(a.identity)}」，${b.name} 实为「${label(b.identity)}」。`,
    ...ea.notes.map((n) => `${a.name}：${n}`),
    ...eb.notes.map((n) => `${b.name}：${n}`),
    `本局变动：${a.name} ${fmt(changes[a.id])}，${b.name} ${fmt(changes[b.id])}。`,
  ];

  room.reveal = { entries: [ea, eb], report };
  room.phase = "reveal";
  return changes;
}

function label(i: string): string {
  return i === "ai" ? "纯 AI" : i === "disguised" ? "伪装者" : "纯真人";
}

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
