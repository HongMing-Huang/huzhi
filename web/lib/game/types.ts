// 游戏核心类型。改动需同步 docs/game-design.md。

export type Identity = "ai" | "human" | "disguised";
export type GuessKind = Identity;
export type Phase = "chat" | "reveal";

export interface Topic {
  id: string;
  title: string;
  summary?: string;
  url?: string;
  source: "zhihu-hot" | "fallback";
}

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  /** 服务端密封的真实身份，揭晓前绝不发给客户端 */
  identity: Identity;
  /** 对外呈现的 AI 人设（identity=disguised 或呈现 AI 风格时使用） */
  personaId?: string;
  /** 登录账号的筹码桌键（user:<id>）；游客为空 */
  userKey?: string;
  guess?: { kind: GuessKind; bet: number; at: number };
}

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  ts: number;
  /** 与上一条消息的间隔毫秒数（侦探线索素材） */
  responseMs: number;
}

export interface RevealEntry {
  playerId: string;
  name: string;
  identity: Identity;
  guessed?: GuessKind;
  bet?: number;
  guessCorrect: boolean;
  points: number;
  notes: string[];
}

export interface Reveal {
  entries: RevealEntry[];
  report: string[];
}

export interface Room {
  id: string;
  topic: Topic;
  phase: Phase;
  round: number;
  maxRounds: number;
  players: Player[];
  messages: ChatMessage[];
  reveal?: Reveal;
  createdAt: number;
}

/** 发给客户端的脱敏视图 */
export interface ClientRoom {
  roomId: string;
  topic: Topic;
  phase: Phase;
  round: number;
  maxRounds: number;
  you: {
    id: string;
    name: string;
    identity: Identity;
    personaId?: string;
    bank: number;
    guess?: { kind: GuessKind; bet: number };
    points: number;
  };
  opponent: { id: string; name: string; hasGuessed: boolean };
  messages: ChatMessage[];
  reveal?: Reveal;
  dataSource: string;
}

export function isIdentity(v: unknown): v is Identity {
  return v === "ai" || v === "human" || v === "disguised";
}
