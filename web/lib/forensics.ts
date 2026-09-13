// 线索系统（Forensics）：把"猜身份"从凭感觉变成有依据的侦查。
//
// ─────────────────────────────────────────────────────────────────────────
// 设计依据（知乎开放平台实检索，见 docs/game-design-v31.md）
//
// 知乎高赞答案直接点名了我们原先的做法是误区：
//
//   「如果我们只用风格判断，就会陷入一个怪圈：越完美的文字，就越容易被当成 AI。
//     反而粗糙的、错漏百出的文字会被追捧。」——@科学声音（142 赞）
//
//   「现在的 AI 已经能主动模仿人类的不完美了……你可以要求它'加入万分之五比例的
//     错别字'。」——同上
//
// 而真正可靠的信号是事实层面的：
//
//   「它答得有鼻子有眼，日期精确到月……我去核对，日期错了一个季度。
//     这种识别不需要任何文风敏感度，它靠的是事实核对。」——@张文保（SEO 从业 20 年）
//
//   「'相关研究表明''行业专家认为'——永远不告诉你具体是哪个研究、哪个专家，
//     模糊归因是 AI 的看家本领。」——@汤姆苏品如
//
//   「'想象一下，你加班到深夜'……AI 写出来就是假，因为它没有真的加过班。」——@一缕微光
//
// 因此本模块把判定从 1 个维度（文风）扩展到 4 个，并把文风降权到 25%——
// 因为文风可以被双向模仿，而事实核验不能。
// ─────────────────────────────────────────────────────────────────────────

import type { IdentityKind } from "./identity";
import { actorOf } from "./identity";

/** 四类线索卡 */
export type ClueKind = "attribution" | "anchor" | "timeline" | "style";

export interface Clue {
  kind: ClueKind;
  /** 卡面标题 */
  title: string;
  /** 0–100，越高越"像真人写的" */
  score: number;
  /** 给玩家看的具体发现（不直接说答案） */
  findings: string[];
  /** 翻开这张卡需要的积分 */
  cost: number;
}

// ---------------------------------------------------------------------------
// 维度 1：归因具体度 —— AI 最稳定的破绽
// ---------------------------------------------------------------------------

/** 模糊归因：引用了来源但不说是谁 */
const VAGUE_ATTRIBUTION =
  /相关研究表明|大量实践证明|行业专家认为|有数据显示|业内人士|据了解|众所周知|研究发现|专家指出|有人说/g;

/** 具体归因：给得出可核对的出处 */
const CONCRETE_ATTRIBUTION =
  /《[^》]{2,20}》|\d{4}\s*年[^，。]{0,10}(报告|论文|研究|调查|财报)|https?:\/\/|公众号|知乎上/g;

function attributionClue(text: string): Clue {
  const vague = text.match(VAGUE_ATTRIBUTION) ?? [];
  const concrete = text.match(CONCRETE_ATTRIBUTION) ?? [];
  const findings: string[] = [];

  let score = 50;
  if (vague.length > 0) {
    score -= Math.min(40, vague.length * 20);
    findings.push(`出现 ${vague.length} 处模糊归因（如「${vague[0]}」），没有给出可核对的具体来源`);
  }
  if (concrete.length > 0) {
    score += Math.min(40, concrete.length * 20);
    findings.push(`出现 ${concrete.length} 处具体出处，可以去核对`);
  }
  if (vague.length === 0 && concrete.length === 0) {
    findings.push("全文没有引用任何外部来源，这条线索无法判断");
  }

  return {
    kind: "attribution",
    title: "归因核查",
    score: Math.max(0, Math.min(100, score)),
    findings,
    cost: 15,
  };
}

// ---------------------------------------------------------------------------
// 维度 2：可核验锚点 —— 真实经历会留下具体痕迹
// ---------------------------------------------------------------------------

/** 具体时间：不是"上个月"而是"3 月 14 号"、"上周三" */
const TIME_ANCHOR = /\d{1,2}\s*月\s*\d{1,2}\s*[号日]|\d{4}\s*年|上?周[一二三四五六日天]|昨天|前天|今早|凌晨\s*\d/g;
/** 具体数量 */
const NUMBER_ANCHOR = /\d+\s*(块|元|万|个|次|年|天|小时|分钟|条|人|倍|%|％)/g;
/** 具体场景物件 */
const OBJECT_ANCHOR = /地铁|工位|食堂|会议室|茶水间|电脑|手机|微信|钉钉|外卖|加班|通勤|房东|同事|领导/g;
/** 空心场景：有画面但无锚点，AI 的典型手法 */
const HOLLOW_SCENE = /想象一下|试想一下|假如你是|设想|不妨想想|请你想象/g;

function anchorClue(text: string): Clue {
  const len = Math.max(1, text.length);
  const per100 = (n: number) => (n / len) * 100;

  const times = text.match(TIME_ANCHOR) ?? [];
  const nums = text.match(NUMBER_ANCHOR) ?? [];
  const objs = text.match(OBJECT_ANCHOR) ?? [];
  const hollow = text.match(HOLLOW_SCENE) ?? [];

  const density = per100(times.length + nums.length + objs.length);
  const findings: string[] = [];

  let score = Math.min(75, Math.round(density * 28));
  if (times.length) findings.push(`有 ${times.length} 处具体时间（如「${times[0]}」）`);
  if (objs.length) findings.push(`提到 ${objs.length} 处具体场景或物件（如「${objs[0]}」）`);
  if (nums.length) findings.push(`有 ${nums.length} 处具体数字`);

  if (hollow.length > 0) {
    score -= 25;
    findings.push(`出现「${hollow[0]}」式的空心场景——有画面感，但没有任何可核对的细节`);
  }
  if (density < 0.5 && hollow.length === 0) {
    findings.push("全文几乎没有可核对的具体细节，像是在谈论而非经历");
  }

  return {
    kind: "anchor",
    title: "锚点扫描",
    score: Math.max(0, Math.min(100, score + 15)),
    findings: findings.slice(0, 3),
    cost: 20,
  };
}

// ---------------------------------------------------------------------------
// 维度 3：内部一致性 —— AI 长文容易前后打架
// ---------------------------------------------------------------------------

function coherenceClue(text: string): Clue {
  const findings: string[] = [];
  let score = 60;

  // 从业年限自相矛盾：文中同时出现多个不同的"N 年"身份陈述
  const years = [...text.matchAll(/(\d+)\s*年(?:的)?(?:经验|从业|工作|入行)/g)].map((m) => Number(m[1]));
  const uniqueYears = [...new Set(years)];
  if (uniqueYears.length > 1) {
    score -= 35;
    findings.push(`文中出现互相冲突的年限表述（${uniqueYears.join(" / ")} 年），时间线对不上`);
  }

  // 新手 vs 老手的身份冲突
  const novice = /刚入行|刚毕业|新手|小白|第一次接触/.test(text);
  const veteran = /多年经验|资深|从业\s*\d+\s*年|老兵|干了很久/.test(text);
  if (novice && veteran) {
    score -= 30;
    findings.push("同时自称新手与资深从业者，身份陈述前后矛盾");
  }

  // 绝对化断言密度：AI 倾向于"一定/必然/毫无疑问"
  const absolute = (text.match(/一定是|必然|毫无疑问|绝对不|从来没有|所有人都/g) ?? []).length;
  if (absolute >= 2) {
    score -= 15;
    findings.push(`有 ${absolute} 处绝对化断言，真人表达通常更留余地`);
  }

  // 自我修正是强人类信号
  const selfCorrect = (text.match(/等下|不对|我重新|说错了|更正一下|想了想|其实我也没/g) ?? []).length;
  if (selfCorrect > 0) {
    score += 20;
    findings.push(`有 ${selfCorrect} 处自我修正的痕迹，像是边想边写`);
  }

  if (findings.length === 0) findings.push("没有发现明显的自相矛盾，这条线索无法定论");

  return {
    kind: "timeline",
    title: "时间线比对",
    score: Math.max(0, Math.min(100, score)),
    findings: findings.slice(0, 3),
    cost: 20,
  };
}

// ---------------------------------------------------------------------------
// 维度 4：文风剖面 —— 保留，但降权（可被双向模仿）
// ---------------------------------------------------------------------------

const STRUCT_WORDS = /首先|其次|再者|综上|总而言之|值得注意的是|总体来看|不仅.{0,8}而且|不是.{0,8}而是/g;
const CASUAL_MARKS = /哈哈|hhh|？？|\?\?|草|狗头|emmm|啊啊啊|。。|，，|~|…/g;

function styleClue(text: string): Clue {
  const len = Math.max(1, text.length);
  const per100 = (n: number) => (n / len) * 100;

  const sentences = text.split(/[。！？!?\n]/).map((s) => s.trim()).filter((s) => s.length > 1);
  let burstiness = 0;
  if (sentences.length >= 2) {
    const lens = sentences.map((s) => s.length);
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const v = lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length;
    burstiness = mean > 0 ? Math.sqrt(v) / mean : 0;
  }

  const structDensity = per100((text.match(STRUCT_WORDS) ?? []).length);
  const casualDensity = per100((text.match(CASUAL_MARKS) ?? []).length);

  const findings: string[] = [];
  findings.push(`句长起伏 ${burstiness.toFixed(2)}（真人通常 >0.5，机器偏均匀）`);
  if (structDensity > 0.6) findings.push(`每百字 ${structDensity.toFixed(1)} 处结构词，行文像提纲`);
  if (casualDensity > 0) findings.push(`每百字 ${casualDensity.toFixed(1)} 处口语标记`);
  findings.push("注意：文风可以被刻意模仿，不要只凭这一条下注");

  const score = Math.max(
    0,
    Math.min(100, Math.round(Math.min(1, burstiness / 0.8) * 45 + Math.min(1, casualDensity / 2) * 25 + 20 - Math.min(1, structDensity / 1.5) * 30)),
  );

  return { kind: "style", title: "文风剖面", score, findings: findings.slice(0, 3), cost: 10 };
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------

/** 四个维度的权重。文风只占 25%——因为它可被双向模仿。 */
export const CLUE_WEIGHTS: Record<ClueKind, number> = {
  anchor: 0.35,
  attribution: 0.25,
  style: 0.25,
  timeline: 0.15,
};

export interface Forensics {
  clues: Clue[];
  /** 0–100 综合"像真人"指数 */
  humanIndex: number;
}

/** 对一段文本做完整取证 */
export function analyze(text: string): Forensics {
  const clues = [attributionClue(text), anchorClue(text), coherenceClue(text), styleClue(text)];
  const humanIndex = Math.round(
    clues.reduce((sum, c) => sum + c.score * CLUE_WEIGHTS[c.kind], 0),
  );
  return { clues, humanIndex };
}

/** 取单张线索卡（玩家花积分翻开时用） */
export function clueOf(text: string, kind: ClueKind): Clue {
  return analyze(text).clues.find((c) => c.kind === kind)!;
}

/**
 * 揭晓时的解释：结合真实身份与取证结果，说明"它是怎么骗过你的"或"破绽在哪"。
 * 与 feed 的 explainIdentity 不同，这里会指出**哪条线索本可以救你**。
 */
export function explainWithForensics(identity: IdentityKind, text: string): string[] {
  const f = analyze(text);
  const truthIsAgent = actorOf(identity) === "agent";
  const out: string[] = [];

  // 找出最有指示性的那条线索（偏离 50 最远的）
  const strongest = [...f.clues].sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50))[0];

  if (truthIsAgent) {
    out.push(`综合取证：像真人指数 ${f.humanIndex}/100`);
    if (strongest.score < 45) {
      out.push(`最关键的破绽在「${strongest.title}」：${strongest.findings[0]}`);
    } else {
      out.push(`这篇的伪装做得不错——${strongest.title}一项甚至拿到 ${strongest.score} 分`);
    }
  } else {
    out.push(`综合取证：像真人指数 ${f.humanIndex}/100`);
    if (strongest.score > 55) {
      out.push(`最有力的证据在「${strongest.title}」：${strongest.findings[0]}`);
    } else {
      out.push(`这位真人写得很像 AI——${strongest.title}只有 ${strongest.score} 分，难怪会误判`);
    }
  }
  return out;
}
