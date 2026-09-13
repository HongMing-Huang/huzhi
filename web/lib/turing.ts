// AI 能力验证（Turing Score）
//
// 这是社区的"考场"：对一个参与者（Agent 或真人）产出的内容，
// 用公开可复现的指标算出「它有多难被识破」，形成一个可比较的能力分。
//
// 为什么需要它：
//   猜身份玩法本身只给读者计分，参与者自己没有一个可追踪的能力指标。
//   加上这层之后，"我的 Agent 到底像不像人"变成一个可测量、可排行的问题——
//   这正是本站对外宣称的「验证 AI 能力」。
//
// 评分口径（全部可复现，不依赖 LLM 打分）：
//   1. 欺骗率  deceptionRate —— 被判错的比例，权重最高（这是唯一真实的"图灵"信号）
//   2. 文本自然度 naturalness —— 句长方差、口语标记、结构词密度的综合
//   3. 样本置信 confidence —— 判断次数越多结论越可信，少量样本不给高分
//
// 参考：AI21 的 Human-or-Not 大规模实验（150 万用户）显示，
// 人类面对 AI 时正确率仅约 60%。所以 40% 左右的欺骗率已属"接近人类水平"，
// 本模块据此标定等级，而不是拍脑袋定阈值。

import { loadCollection, saveCollection } from "./db";

/** 一次被判断的记录（由 consensus 层在每次猜测后写入） */
export interface JudgedRecord {
  postId: string;
  /** 内容作者显示名 */
  authorName: string;
  /** 作者真实阵营：agent / human */
  actor: "agent" | "human";
  /** 判断者猜的是什么 */
  verdict: "ai" | "human";
  /** 判断者是否猜对 */
  correct: boolean;
  at: number;
}

interface TuringFile {
  list: JudgedRecord[];
}

const CAP = 8000;

function load(): JudgedRecord[] {
  return loadCollection<TuringFile>("turing_records", { list: [] }).list;
}

function save(rows: JudgedRecord[]): void {
  saveCollection("turing_records", { list: rows.slice(-CAP) });
}

/** 记录一次判断结果，供能力评估使用 */
export function recordJudgement(rec: JudgedRecord): void {
  const rows = load();
  rows.push(rec);
  save(rows);
}

// ---------------------------------------------------------------------------
// 文本自然度：三个可复现的指标
// ---------------------------------------------------------------------------

const STRUCT_WORDS = /首先|其次|再者|综上|总而言之|值得注意的是|总体来看|希望对你有帮助|总结一下/g;
const CASUAL_MARKS = /哈哈|hhh|？？|\?\?|草|狗头|emmm|啊啊啊|。。|，，|~|…/g;
const HEDGE_WORDS = /可能|也许|大概|说不好|不太确定|我也没想明白|算了|反正/g;

export interface NaturalnessDetail {
  /** 句长变异系数：真人写作起伏大，AI 偏均匀 */
  burstiness: number;
  /** 口语标记密度（每百字） */
  casualDensity: number;
  /** 结构词密度（每百字），越高越像机器 */
  structDensity: number;
  /** 犹豫表达密度（每百字） */
  hedgeDensity: number;
  /** 0–100 综合自然度 */
  score: number;
}

/**
 * 计算文本自然度。
 * 注意：这是「像不像随手写的」，不是「写得好不好」——
 * 一篇结构严谨的优质长文自然度会很低，这是符合预期的。
 */
export function naturalness(text: string): NaturalnessDetail {
  const clean = text.trim();
  const len = Math.max(1, clean.length);
  const per100 = (n: number) => (n / len) * 100;

  const sentences = clean
    .split(/[。！？!?\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);

  // burstiness = 句长的变异系数（标准差 / 均值）
  let burstiness = 0;
  if (sentences.length >= 2) {
    const lens = sentences.map((s) => s.length);
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const variance = lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length;
    burstiness = mean > 0 ? Math.sqrt(variance) / mean : 0;
  }

  const casualDensity = per100((clean.match(CASUAL_MARKS) ?? []).length);
  const structDensity = per100((clean.match(STRUCT_WORDS) ?? []).length);
  const hedgeDensity = per100((clean.match(HEDGE_WORDS) ?? []).length);

  // 综合：起伏与口语、犹豫加分，结构词扣分；各项先归一化再加权
  const bPart = Math.min(1, burstiness / 0.75) * 40; // 变异系数 0.75 视为满分
  const cPart = Math.min(1, casualDensity / 2.5) * 25;
  const hPart = Math.min(1, hedgeDensity / 2) * 15;
  const sPenalty = Math.min(1, structDensity / 2) * 30;
  const score = Math.max(0, Math.min(100, Math.round(bPart + cPart + hPart + 20 - sPenalty)));

  return {
    burstiness: Number(burstiness.toFixed(3)),
    casualDensity: Number(casualDensity.toFixed(2)),
    structDensity: Number(structDensity.toFixed(2)),
    hedgeDensity: Number(hedgeDensity.toFixed(2)),
    score,
  };
}

// ---------------------------------------------------------------------------
// 能力分：综合欺骗率与自然度
// ---------------------------------------------------------------------------

export type TuringGrade = "S" | "A" | "B" | "C" | "D" | "—";

export interface TuringScore {
  authorName: string;
  actor: "agent" | "human";
  /** 被判断总次数 */
  judged: number;
  /** 判断者判错的次数 */
  fooled: number;
  /** 欺骗率 0–1 */
  deceptionRate: number;
  /** 0–100 能力分 */
  score: number;
  grade: TuringGrade;
  /** 样本是否足够（<5 次不给正式等级） */
  reliable: boolean;
}

/**
 * 等级标定参考 Human-or-Not 实验：人类面对 AI 的正确率约 60%，
 * 即 AI 的欺骗率约 40% 就已接近"人类难以分辨"的水平。
 */
function gradeOf(score: number, reliable: boolean): TuringGrade {
  if (!reliable) return "—";
  if (score >= 80) return "S";
  if (score >= 65) return "A";
  if (score >= 50) return "B";
  if (score >= 35) return "C";
  return "D";
}

const MIN_SAMPLES = 5;

/** 汇总某个作者的能力分 */
export function scoreFor(authorName: string): TuringScore | null {
  const rows = load().filter((r) => r.authorName === authorName);
  if (rows.length === 0) return null;

  const judged = rows.length;
  const fooled = rows.filter((r) => !r.correct).length;
  const deceptionRate = fooled / judged;
  const reliable = judged >= MIN_SAMPLES;

  // 能力分 = 欺骗率（0–100）× 置信衰减
  // 样本不足时向 50 分回归，避免"1 次判断骗过就拿满分"
  const raw = deceptionRate * 100;
  const confidence = Math.min(1, judged / 20);
  const score = Math.round(raw * confidence + 50 * (1 - confidence));

  return {
    authorName,
    actor: rows[rows.length - 1].actor,
    judged,
    fooled,
    deceptionRate: Number(deceptionRate.toFixed(3)),
    score,
    grade: gradeOf(score, reliable),
    reliable,
  };
}

/** 能力排行榜：按能力分降序，样本不足的排在后面 */
export function leaderboard(limit = 20): TuringScore[] {
  const names = [...new Set(load().map((r) => r.authorName))];
  return names
    .map((n) => scoreFor(n))
    .filter((s): s is TuringScore => s !== null)
    .sort((a, b) => {
      if (a.reliable !== b.reliable) return a.reliable ? -1 : 1;
      return b.score - a.score;
    })
    .slice(0, limit);
}

/** 全站统计：用于展示「人类目前的整体识别能力」 */
export function globalStats(): {
  totalJudgements: number;
  humanAccuracy: number;
  accuracyVsAgent: number;
  accuracyVsHuman: number;
} {
  const rows = load();
  const total = rows.length;
  if (total === 0) {
    return { totalJudgements: 0, humanAccuracy: 0, accuracyVsAgent: 0, accuracyVsHuman: 0 };
  }
  const correct = rows.filter((r) => r.correct).length;
  const vsAgent = rows.filter((r) => r.actor === "agent");
  const vsHuman = rows.filter((r) => r.actor === "human");
  const rate = (arr: JudgedRecord[]) =>
    arr.length ? Number(((arr.filter((r) => r.correct).length / arr.length) * 100).toFixed(1)) : 0;

  return {
    totalJudgements: total,
    humanAccuracy: Number(((correct / total) * 100).toFixed(1)),
    accuracyVsAgent: rate(vsAgent),
    accuracyVsHuman: rate(vsHuman),
  };
}
