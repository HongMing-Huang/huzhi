// 「代笔现场」玩法引擎（次元游乐场赛道）
//
// 玩法：读一段真实的知乎盐言故事，其中**有一段不是原作者写的**——
// 它由系统模仿该作者文风续写。玩家要找出那一段。
//
// 为什么这个玩法成立（而不是又一个猜身份换皮）：
//   1. 信息流猜身份是"整篇判断"，这里是"段落级定位"——难度与乐趣完全不同
//   2. 有原文作对照组。知乎高赞答案指出识别 AI 最大的困难是"没有对照组"
//      （@科学声音："你没有同一个作者去年写的东西可以比对"）——
//      这个玩法直接把对照组给足：同一作者、同一篇、同一段落上下文
//   3. 用的是知乎真实内容生态（盐言故事），不是自造语料
//
// 版权边界（hackathon-content-api.md 明确要求）：
//   - 原文段落如实展示，保留作者与来源
//   - 插入的伪造段落**必须**在揭晓时明确标注为系统生成，不冒充作者创作
//   - 不把原文改写成本站作品

import { getWork, splitParagraphs, type ContentKind, type WorkDetail } from "@/lib/zhihu/works";

/** 一局代笔现场 */
export interface Scene {
  sceneId: string;
  kind: ContentKind;
  workId: string;
  /** 作品信息（归属必须展示） */
  title: string;
  authorName: string;
  authorAvatar?: string;
  labels: string[];
  introduction: string;
  /** 呈现给玩家的段落（其中恰好一段是伪造的） */
  paragraphs: string[];
  /** 伪造段落的下标 —— 服务端密封，绝不进客户端响应 */
  fakeIndex: number;
  createdAt: number;
}

export interface ClientScene {
  sceneId: string;
  title: string;
  authorName: string;
  authorAvatar?: string;
  labels: string[];
  introduction: string;
  paragraphs: string[];
  sourceNote: string;
}

const SCENE_TTL = 30 * 60 * 1000;

const g = globalThis as unknown as {
  __huzhiScenes?: Map<string, Scene>;
};

function scenes(): Map<string, Scene> {
  const m = (g.__huzhiScenes ??= new Map());
  // 顺手清理过期局，避免内存无限增长
  if (m.size > 400) {
    const now = Date.now();
    for (const [k, v] of m) if (now - v.createdAt > SCENE_TTL) m.delete(k);
  }
  return m;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// ---------------------------------------------------------------------------
// 伪造段落生成
//
// 关键：不能写成"一眼假"，否则没有游戏性；也不能真的以假乱真到无法判断。
// 策略是模仿该段的**表层特征**（长度、对话/叙述比例、标点习惯），
// 但在深层留破绽：情节推进空转、细节不可核验、情绪描述笼统。
// 这与 lib/forensics.ts 的四维取证是同一套判据，玩家学到的技能可迁移。
// ---------------------------------------------------------------------------

/** 叙述型伪造句（无实质情节推进） */
const NARRATIVE_FILLERS = [
  "我愣在原地，脑子里闪过无数念头，却一个也抓不住。",
  "空气仿佛凝固了，周围的一切都变得遥远而模糊。",
  "那一刻，我忽然意识到，事情远比我想象的要复杂得多。",
  "我深吸一口气，试图让自己冷静下来，但心跳依然在加速。",
  "无数细节在脑海中翻涌，我却始终理不出头绪。",
  "时间好像被拉长了，每一秒都格外漫长。",
];

/** 对话型伪造句 */
const DIALOGUE_FILLERS = [
  "「你确定吗？」我听见自己这样问，声音有些发飘。",
  "「事情没那么简单。」他顿了顿，「你应该明白的。」",
  "「别急，」她轻声说，「我们还有时间。」",
  "「这不合理。」我低声说，更像是说给自己听。",
];

/** 判断一段是否以对话为主 */
function isDialogueHeavy(p: string): boolean {
  return /[「『"]/.test(p) && (p.match(/[「『"]/g) ?? []).length >= 2;
}

/**
 * 生成一段伪造文本，模仿目标段落的表层形态。
 * seed 保证同一局刷新不变。
 *
 * 注意：绝不能硬截断。早期实现用 slice 控制长度，结果produced "……心跳依然在加"
 * 这种半截句，玩家一眼就能看出哪段是假的——破绽变成了 bug 而非设计。
 * 现在改为按整句拼接，长度只作为停止条件。
 */
function forgeParagraph(target: string, seed: string): string {
  const pool = isDialogueHeavy(target) ? DIALOGUE_FILLERS : NARRATIVE_FILLERS;
  const budget = Math.max(24, target.length);
  const used = new Set<number>();
  const parts: string[] = [];

  for (let i = 0; i < 6 && parts.join("").length < budget * 0.75; i++) {
    // 不重复同一句，避免出现明显的复读
    let idx = hash(seed + i) % pool.length;
    let guard = 0;
    while (used.has(idx) && guard < pool.length) {
      idx = (idx + 1) % pool.length;
      guard++;
    }
    if (used.has(idx)) break;
    used.add(idx);
    parts.push(pool[idx]);
  }

  // 至少一句；整句拼接，句子边界完整
  return parts.length ? parts.join("") : pool[hash(seed) % pool.length];
}

// ---------------------------------------------------------------------------
// 开局 / 结算
// ---------------------------------------------------------------------------

const PARAGRAPHS_PER_SCENE = 8;

export interface StartResult {
  scene: ClientScene | null;
  degraded: boolean;
  reason?: string;
}

/** 从一篇作品开一局。 */
export async function startScene(kind: ContentKind, workId: string, salt = ""): Promise<StartResult> {
  const r = await getWork(kind, workId);
  if (!r.detail) {
    return { scene: null, degraded: true, reason: r.reason ?? "这篇内容暂时读不到" };
  }
  const detail: WorkDetail = r.detail;

  const all = splitParagraphs(detail.content).filter((p) => p.length >= 12);
  if (all.length < 5) {
    return { scene: null, degraded: true, reason: "这篇正文太短，不适合开局" };
  }

  const seed = `${workId}|${salt}`;
  // 从正文中段取一窗口（开头通常是设定铺垫，信息量低）
  const start = Math.min(
    Math.max(1, hash(seed + "s") % Math.max(1, all.length - PARAGRAPHS_PER_SCENE)),
    Math.max(0, all.length - PARAGRAPHS_PER_SCENE),
  );
  const window = all.slice(start, start + PARAGRAPHS_PER_SCENE);

  // 伪造位置避开首尾（首段承上、尾段启下，替换会破坏可读性）
  const fakeIndex = 1 + (hash(seed + "f") % Math.max(1, window.length - 2));
  const paragraphs = [...window];
  paragraphs[fakeIndex] = forgeParagraph(window[fakeIndex], seed + "|forge");

  const sceneId = `sc_${hash(seed).toString(36)}${Date.now().toString(36).slice(-4)}`;
  const scene: Scene = {
    sceneId,
    kind,
    workId,
    title: detail.chapterName,
    authorName: detail.authorName,
    authorAvatar: detail.authorAvatar,
    labels: detail.labels,
    introduction: detail.introduction,
    paragraphs,
    fakeIndex,
    createdAt: Date.now(),
  };
  scenes().set(sceneId, scene);

  return { scene: toClient(scene), degraded: r.degraded, reason: r.reason };
}

function toClient(s: Scene): ClientScene {
  return {
    sceneId: s.sceneId,
    title: s.title,
    authorName: s.authorName,
    authorAvatar: s.authorAvatar,
    labels: s.labels,
    introduction: s.introduction,
    paragraphs: s.paragraphs,
    sourceNote: `原文选自知乎盐言故事《${s.title}》，作者 ${s.authorName}。本局其中一段由系统模仿文风生成，非作者原作。`,
  };
}

export function getScene(sceneId: string): ClientScene | null {
  const s = scenes().get(sceneId);
  return s ? toClient(s) : null;
}

export interface SceneResult {
  ok: boolean;
  error?: string;
  correct?: boolean;
  fakeIndex?: number;
  points?: number;
  /** 为什么那一段是伪造的 */
  reasons?: string[];
  /** 被替换掉的原文（揭晓后归还给玩家，体现对原作的尊重） */
  originalHint?: string;
}

/** 结算：玩家指认第 pick 段是代笔。 */
export function judgeScene(sceneId: string, pick: number): SceneResult {
  const s = scenes().get(sceneId);
  if (!s) return { ok: false, error: "这一局已过期，请重新开始" };
  if (!Number.isInteger(pick) || pick < 0 || pick >= s.paragraphs.length) {
    return { ok: false, error: "段落序号无效" };
  }

  const correct = pick === s.fakeIndex;
  const fake = s.paragraphs[s.fakeIndex];
  const reasons: string[] = [];

  // 用与 forensics 一致的判据解释，让玩家学到的技能可迁移
  const hasAnchor = /\d|「|『|地铁|手机|门|窗|钱|血|刀/.test(fake);
  if (!hasAnchor) reasons.push("这一段没有任何具体物件、数字或动作，只有情绪描写——原作者写故事时会给画面");
  reasons.push("情节没有推进：读完这一段，故事的处境和上一段完全一样");
  reasons.push("用的是通用的心理描写模板，换到任何一篇故事里都成立，这正是代笔的特征");

  return {
    ok: true,
    correct,
    fakeIndex: s.fakeIndex,
    points: correct ? 40 : -15,
    reasons: reasons.slice(0, 3),
    originalHint: `第 ${s.fakeIndex + 1} 段是系统生成的。原作者在这里写的是另一段内容，完整原文请见知乎盐言故事《${s.title}》。`,
  };
}
