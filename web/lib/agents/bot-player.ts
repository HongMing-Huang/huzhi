// Bot 玩家：模拟「真 AI 装人 / 伪装者 / 纯真人」三种对手。
// 文案风格差异刻意埋了可被侦探发现的 tell（响应速度、标点、结构词）。
import { chatOrFallback } from "@/lib/ai/provider";
import { buildSystemPrompt, goalPrompt, personaById, type Goal } from "@/lib/ai/personas";
import { mockReply } from "@/lib/ai/mock";
import { secureRand } from "@/lib/agents/router";
import type { ChatMessage, Identity, Player, Room } from "@/lib/game/types";
import { BET_STEPS } from "@/lib/game/scoring";

const OPENINGS = [
  (topic: string) => `先别急着站队。你对「${topic}」的第一反应是什么？`,
  (topic: string) => `如果不看热评，你会怎么判断「${topic}」这件事？`,
  () => "我先问个有点冒犯的问题：你更相信证据，还是自己的第一感觉？",
  () => "来，别写标准答案。说一个你真的经历过、但不太好意思承认的判断失误。",
  () => "我们换个玩法：用一句话说观点，再说一句你为什么可能是错的。你先？",
  () => "你觉得一个人说话太完整，是认真，还是更像机器？",
];

function goalFor(identity: Identity): Goal {
  // 纯 AI 在装人；伪装者（真人装AI 或 bot 模拟）在装 AI；纯真人正常说话。
  return identity === "ai" ? "ACT_HUMAN" : identity === "disguised" ? "ACT_AI" : "ACT_HUMAN";
}

function delayFor(identity: Identity): number {
  switch (identity) {
    case "ai":
      return 400 + secureRand() * 1200; // 秒回：机器 tell
    case "disguised":
      return 1500 + secureRand() * 3500; // 刻意模仿人类停顿
    default:
      return 2500 + secureRand() * 6000; // 真人式慢
  }
}

/** 对手先开口：问题库刻意混合审问、经历与自我怀疑，客户端看不出对手来源。 */
export function botOpening(room: Room, bot: Player): ChatMessage {
  const index = Math.floor(secureRand() * OPENINGS.length);
  return {
    id: `m_${Date.now()}_${secureRand().toString(36).slice(2, 8)}`,
    from: bot.id,
    text: OPENINGS[index](room.topic.title),
    ts: Date.now(),
    responseMs: 0,
  };
}

export async function botReply(room: Room, bot: Player, turn: number): Promise<ChatMessage> {
  const topic = room.topic.title;
  const persona = personaById(bot.personaId);
  const goal = goalFor(bot.identity);
  // 装 AI 时套用人设层；装人时用普通网友语气（人设层与目标层解耦，借鉴 wolfcha 双层 prompt）
  const system =
    goal === "ACT_AI"
      ? buildSystemPrompt(persona, goal)
      : `${goalPrompt(goal)}\n\nPERSONA: 你就是个普通网友，有自己的脾气和口头禅，说话随意。`;
  const history = room.messages
    .slice(-6)
    .map((m) => `${m.from === bot.id ? "你" : "对方"}说：${m.text}`)
    .join("\n");
  const user = `当前话题：「${topic}」。\n最近对话：\n${history || "（刚开始）"}\n请以你的身份回复一条（1-4 句）。`;

  const { text } = await chatOrFallback(system, user, () =>
    mockReply(goal, topic, turn, bot.personaId ?? bot.identity, secureRand().toString(36).slice(0, 6)),
  );

  const prev = room.messages[room.messages.length - 1];
  const gap = prev ? delayFor(bot.identity) : 1200;
  // 真实等待（封顶 4s）：「回复耗时」不再同帧伪造，侦探的节奏线索与实际行为自洽
  const wait = Math.min(Math.round(gap), 4000);
  await new Promise((r) => setTimeout(r, wait));
  return {
    id: `m_${Date.now()}_${secureRand().toString(36).slice(2, 8)}`,
    from: bot.id,
    text,
    ts: Date.now(),
    responseMs: wait,
  };
}

/** 每当用户发言后调用：bot 凑够轮次就以一定概率锁定猜测+下注。 */
export function botMaybeLock(room: Room, bot: Player): void {
  if (bot.guess || room.phase !== "chat") return;
  const userMsgs = room.messages.filter((m) => m.from !== bot.id).length;
  if (userMsgs < 3) return;
  const lockChance = 0.25 + userMsgs * 0.12;
  if (secureRand() > lockChance) return;
  botLockNow(room, bot);
}

/** 对方已开牌时的跟注压力：bot 立刻锁定，避免对局卡住。 */
export function botLockNow(room: Room, bot: Player): void {
  if (bot.guess || room.phase !== "chat") return;
  bot.guess = pickBotGuess(room, bot);
}

function pickBotGuess(room: Room, bot: Player): NonNullable<Player["guess"]> {
  // 简易启发式：看用户最近一条是否有 AI 结构词
  const lastUser = [...room.messages].reverse().find((m) => m.from !== bot.id);
  const aiish = lastUser ? /首先|其次|综上|总体来看|值得注意的是/.test(lastUser.text) : false;
  const r = secureRand();
  const kind = aiish ? (r < 0.6 ? ("disguised" as const) : ("ai" as const)) : r < 0.45 ? ("human" as const) : r < 0.75 ? ("disguised" as const) : ("ai" as const);
  const bet = secureRand() < 0.6 ? BET_STEPS[0] : BET_STEPS[1];
  return { kind, bet, at: Date.now() };
}
