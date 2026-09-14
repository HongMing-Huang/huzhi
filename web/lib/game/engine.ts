// 游戏引擎：建房 → 发言（bot 应答）→ 互猜下注 → 揭晓结算。
import { randomUUID } from "node:crypto";
import { store } from "./store";
import { settle } from "./scoring";
import { assignBotIdentity, assignHumanIdentity, secureRand } from "@/lib/agents/router";
import { botLockNow, botMaybeLock, botOpening, botReply } from "@/lib/agents/bot-player";
import { PERSONAS } from "@/lib/ai/personas";
import { takeInsuranceIfArmed } from "@/lib/social";
import { isIdentity, type ClientRoom, type GuessKind, type Identity, type Player, type Room, type Topic } from "./types";

const MAX_ROUNDS = 5;

export function bankKey(p: Player, roomId: string): string {
  if (p.userKey) return p.userKey;
  return p.isBot ? `bot:${roomId}` : `human:${p.name}`;
}

export function createRoom(name: string, topic: Topic, userKey?: string): Room {
  const room: Room = {
    id: randomUUID().slice(0, 8),
    topic,
    phase: "chat",
    round: 0,
    maxRounds: MAX_ROUNDS,
    players: [],
    messages: [],
    createdAt: Date.now(),
  };
  const you: Player = {
    id: "u_" + randomUUID().slice(0, 6),
    name,
    isBot: false,
    identity: assignHumanIdentity(),
    personaId: undefined,
    userKey,
  };
  if (you.identity === "disguised") {
    you.personaId = PERSONAS[Math.floor(secureRand() * PERSONAS.length)].id;
  }
  const bot: Player = {
    id: "bot",
    name: "盲盒对手",
    isBot: true,
    identity: assignBotIdentity(),
    personaId: undefined,
  };
  if (bot.identity === "disguised") {
    bot.personaId = PERSONAS[Math.floor(secureRand() * PERSONAS.length)].id;
  }
  room.players = [you, bot];
  room.messages.push(botOpening(room, bot));
  store.set(room);
  return room;
}

/** 两位真人进入同一套密封身份矩阵；双方都可能抽到“真人”或“伪装成 AI”。 */
export function createHumanRoom(
  first: { name: string; userKey?: string },
  second: { name: string; userKey?: string },
  topic: Topic,
): Room {
  const room: Room = {
    id: randomUUID().slice(0, 8), topic, phase: "chat", round: 0, maxRounds: MAX_ROUNDS, players: [], messages: [], createdAt: Date.now(),
  };
  room.players = [first, second].map((input) => {
    const identity = assignHumanIdentity();
    const player: Player = { id: "u_" + randomUUID().slice(0, 6), name: input.name, isBot: false, identity, userKey: input.userKey };
    if (identity === "disguised") player.personaId = PERSONAS[Math.floor(secureRand() * PERSONAS.length)].id;
    return player;
  });
  store.set(room);
  return room;
}

export async function addUserMessage(room: Room, playerId: string, text: string): Promise<void> {
  if (room.phase !== "chat") throw new Error("对局已结束");
  const clean = text.trim().slice(0, 500);
  if (!clean) throw new Error("不能发空消息");
  if (/我是(个?AI|Ai|ai|人工智能|真人|人类|机器人|程序)/.test(clean)) {
    throw new Error("反套路规则：禁止自曝身份！");
  }
  const prev = room.messages[room.messages.length - 1];
  if (prev?.from === playerId) throw new Error("等对方回复后再发，别连发露馅");
  room.messages.push({
    id: randomUUID().slice(0, 8),
    from: playerId,
    text: clean,
    ts: Date.now(),
    responseMs: prev ? Math.min(99999, Date.now() - prev.ts) : 0,
  });
  const turnCounts = room.players.map((p) => room.messages.filter((m) => m.from === p.id).length);
  room.round = Math.min(MAX_ROUNDS, Math.min(...turnCounts));

  const bot = room.players.find((p) => p.isBot);
  if (!bot) {
    store.set(room);
    return;
  }
  botMaybeLock(room, bot);
  // 不是条条秒回：约 30% 的消息 bot 选择"已读，等下一句"（真人也会这样），
  // 避免"我发一句他立刻回一句"的机械感让人一眼识破。回合仍按消息数累积，
  // 玩家连发或 bot 沉默都不会卡死（沉默概率 <1，对局必然能聊满 2 轮）。
  if (Math.random() < 0.3) {
    store.set(room);
    return;
  }
  const reply = await botReply(room, bot, room.round);
  room.messages.push(reply);
  if (room.phase === "chat" && bot.guess && room.players[0].guess) {
    finishReveal(room);
  }
  store.set(room);
}

export function submitGuess(room: Room, playerId: string, kind: GuessKind, bet: number): void {
  if (room.phase !== "chat") throw new Error("对局已结束");
  if (!isIdentity(kind)) throw new Error("无效猜测");
  if (!Number.isInteger(bet) || bet <= 0) throw new Error("无效下注");
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new Error("不在对局中");
  if (room.round < 2) throw new Error("至少聊 2 轮才能下注");
  if (player.guess) throw new Error("已锁定过猜测，不能改注");
  const bank = store.bank(bankKey(player, room.id));
  if (bet > bank) throw new Error(`筹码不足（你有 ${bank}）`);
  player.guess = {
    kind,
    bet,
    at: Date.now(),
    insured: player.userKey ? takeInsuranceIfArmed(player.userKey) : false,
  };

  const bot = room.players.find((p) => p.isBot);
  if (bot && !bot.guess) {
    botLockNow(room, bot); // 对方已开牌，bot 立刻跟注
  }
  if (room.players.every((p) => p.guess)) {
    finishReveal(room);
  }
  store.set(room);
}

export function finishReveal(room: Room): void {
  if (room.phase === "reveal") return;
  const changes = settle(room);
  for (const p of room.players) {
    store.addBank(bankKey(p, room.id), changes[p.id] ?? 0, `灵魂对局 ${room.id} 结算`);
  }
  room.phase = "reveal";
  store.set(room);
}

export function toClientRoom(room: Room, viewerId: string, dataSource?: string): ClientRoom {
  const you = room.players.find((p) => p.id === viewerId) ?? room.players[0];
  const opp = room.players.find((p) => p.id !== you.id)!;
  return {
    roomId: room.id,
    topic: room.topic,
    phase: room.phase,
    round: room.round,
    maxRounds: room.maxRounds,
    you: {
      id: you.id,
      name: you.name,
      identity: you.identity as Identity,
      personaId: you.personaId,
      bank: store.bank(bankKey(you, room.id)),
      guess: you.guess ? { kind: you.guess.kind, bet: you.guess.bet, insured: you.guess.insured } : undefined,
      points: room.reveal?.entries.find((e) => e.playerId === you.id)?.points ?? 0,
    },
    opponent: { id: opp.id, name: opp.name, hasGuessed: Boolean(opp.guess) },
    messages: room.messages,
    reveal: room.reveal,
    dataSource: dataSource ?? room.topic.source,
  };
}
