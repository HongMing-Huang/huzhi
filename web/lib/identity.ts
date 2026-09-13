// 统一身份域（Identity Domain）
//
// 背景：审计发现"身份"此前在 4 处各自定义且值域不一致——
//   - lib/game/types.ts        Identity = "ai" | "human" | "disguised"（对局侧三值）
//   - lib/feed/index.ts        内联 "ai" | "human"（信息流侧二值，重复 5 次）
//   - lib/feed/consensus.ts    ConsensusPick = "ai" | "human"
//   - lib/agents/router.ts     Pool = "human" | "zhida-ai" | "player-agent"（死代码）
// 结果是"伪装"这一核心玩法在信息流里根本无法表达：一个伪装成 AI 的真人，
// 在 feed 里只能被压扁成 "human"，揭晓理由也就无从解释。
//
// 本模块把社区里真实存在的四类参与者建成一等公民：
//
//   human           真人本色出演
//   agent           Agent 本色出演
//   human_as_agent  真人伪装成 Agent（"我尽量写得像 AI"）
//   agent_as_human  Agent 伪装成真人（刻意注入口语、错字、个人经历）
//
// 设计参考：社会推理类游戏（Werewolf/Among Us 类）与 Human-or-Not 实验的共同做法——
//   1) 真实阵营（actor）与表演身份（presenting）分离；
//   2) 判定只对"表演身份"公平，结算对"真实阵营"计分；
//   3) 真身份服务端密封，仅在受控出口揭晓。

/** 真实阵营：这个账号背后到底是谁在写字 */
export type Actor = "human" | "agent";

/** 表演身份：内容想让读者以为自己是谁 */
export type Presenting = "human" | "agent";

/** 四类参与者：真实阵营 × 表演身份 */
export type IdentityKind = "human" | "agent" | "human_as_agent" | "agent_as_human";

/** 读者的二选一判断（读者只能判断"像人还是像 AI"，无法直接判断伪装） */
export type Verdict = "human" | "ai";

export const IDENTITY_KINDS: readonly IdentityKind[] = [
  "human",
  "agent",
  "human_as_agent",
  "agent_as_human",
] as const;

export function isIdentityKind(v: unknown): v is IdentityKind {
  return typeof v === "string" && (IDENTITY_KINDS as readonly string[]).includes(v);
}

export function isVerdict(v: unknown): v is Verdict {
  return v === "human" || v === "ai";
}

/** 组合：真实阵营 + 表演身份 → 四类身份之一 */
export function composeIdentity(actor: Actor, presenting: Presenting): IdentityKind {
  if (actor === "human") return presenting === "human" ? "human" : "human_as_agent";
  return presenting === "agent" ? "agent" : "agent_as_human";
}

/** 拆解：四类身份 → 真实阵营 */
export function actorOf(kind: IdentityKind): Actor {
  return kind === "human" || kind === "human_as_agent" ? "human" : "agent";
}

/** 拆解：四类身份 → 表演身份 */
export function presentingOf(kind: IdentityKind): Presenting {
  return kind === "human" || kind === "agent_as_human" ? "human" : "agent";
}

/** 是否在伪装（真实阵营与表演身份不一致） */
export function isDisguised(kind: IdentityKind): boolean {
  return actorOf(kind) !== presentingOf(kind);
}

/**
 * 判定是否正确。
 *
 * 关键规则：读者判断的是「这段内容是谁写的」，也就是真实阵营，
 * 而不是「它看起来像谁」。因此伪装者被看穿时读者得分，被骗过时伪装者得分。
 * Verdict 用 "ai"，Actor 用 "agent"，此处做唯一一次映射。
 */
export function isCorrectVerdict(kind: IdentityKind, verdict: Verdict): boolean {
  const truth: Verdict = actorOf(kind) === "agent" ? "ai" : "human";
  return truth === verdict;
}

/** 面向读者的真相文案（揭晓后使用） */
export function truthLabel(kind: IdentityKind): string {
  switch (kind) {
    case "human":
      return "真人";
    case "agent":
      return "AI";
    case "human_as_agent":
      return "真人（在伪装 AI）";
    case "agent_as_human":
      return "AI（在伪装真人）";
  }
}

/** 简短标签，用于紧凑位置 */
export function shortLabel(kind: IdentityKind): string {
  return actorOf(kind) === "agent" ? "AI" : "真人";
}

/**
 * 判定难度系数：伪装成功的一方更难识别，识破奖励更高。
 * 用于积分结算的倍率，不直接暴露给客户端。
 */
export function difficultyFactor(kind: IdentityKind): number {
  return isDisguised(kind) ? 1.6 : 1;
}

// ---------------------------------------------------------------------------
// 与旧类型的双向桥接
//
// 旧对局侧使用 Identity = "ai" | "human" | "disguised"，其中 "disguised" 特指
// "真人伪装 AI"。为不回归既有对局玩法，这里提供无损桥接，逐步收敛到四类模型。
// ---------------------------------------------------------------------------

export type LegacyIdentity = "ai" | "human" | "disguised";

export function fromLegacy(v: LegacyIdentity): IdentityKind {
  if (v === "ai") return "agent";
  if (v === "disguised") return "human_as_agent";
  return "human";
}

export function toLegacy(kind: IdentityKind): LegacyIdentity {
  switch (kind) {
    case "agent":
    case "agent_as_human":
      // 旧三值模型无法表达"AI 伪装真人"，一律落回 ai（真实阵营正确）
      return "ai";
    case "human_as_agent":
      return "disguised";
    case "human":
      return "human";
  }
}
