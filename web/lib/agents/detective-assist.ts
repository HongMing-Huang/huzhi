// 侦探辅助 Agent：只输出特征线索，绝不给身份结论（设计红线）。
// 全部为确定性启发式，文献依据见 docs/research/gameplay-research.md。
import type { ChatMessage } from "@/lib/game/types";

export interface Clue {
  label: string;
  detail: string;
}

const AI_FILLERS = ["首先", "其次", "再者", "综上", "总而言之", "值得注意的是", "总体来看", "希望对你有帮助", "以上。"];
const HUMAN_MARKERS = ["哈哈", "hhh", "？？", "草", "狗头", "emmm", "啊啊啊", "😅", "🤡", "。。", "，，"];

export function analyzeMessages(messages: ChatMessage[]): Clue[] {
  const texts = messages.map((m) => m.text);
  if (texts.length === 0) return [];

  const lens = texts.map((t) => t.length);
  const avgLen = avg(lens);
  const lenStd = std(lens);

  // 标点完美度：句末规范收尾 + 无混用错标点
  const wellEnded = texts.filter((t) => /[。？！?!]$/.test(t.trim())).length;
  const mixedPunct = texts.filter((t) => /[,;:]|，，/.test(t)).length;

  // AI 腔密度
  const fillerHits = texts.filter((t) => AI_FILLERS.some((f) => t.includes(f))).length;

  // 人味标记
  const humanHits = texts.filter((t) => HUMAN_MARKERS.some((f) => t.includes(f))).length;

  // 响应节奏
  const gaps = messages.map((m) => m.responseMs).filter((g) => g > 0);
  const avgGap = gaps.length ? avg(gaps) : 0;

  const clues: Clue[] = [
    {
      label: "句式均匀度",
      detail: `平均 ${avgLen.toFixed(0)} 字/条，波动 ±${lenStd.toFixed(0)} 字。${
        lenStd < 8 ? "长度异常稳定，是低 burstiness 信号（机器常见）" : "长短交错，更像随手打字"
      }`,
    },
    {
      label: "标点热力",
      detail: `${wellEnded}/${texts.length} 条规范句末收尾${mixedPunct ? `，${mixedPunct} 条有混用/错标点（人味信号）` : "，零错标点（机器倾向，但也可能是标点洁癖）"}`,
    },
    {
      label: "AI 腔密度",
      detail: `${fillerHits}/${texts.length} 条出现「首先/综上/总而言之」类结构词。${fillerHits >= texts.length / 2 ? "结构词密集，值得追问细节" : "结构词不多"}`,
    },
    {
      label: "人味信号",
      detail: humanHits
        ? `${humanHits} 条带语气词/错字/梗（哈哈、？？、狗头…），人类概率线索 +`
        : "没有语气词、错字或梗，全程干净得可疑",
    },
  ];

  if (avgGap > 0) {
    clues.push({
      label: "响应节奏",
      detail: `平均间隔 ${(avgGap / 1000).toFixed(1)} 秒。${avgGap < 2500 ? "快得像不假思索（检索型选手？）" : "有停顿和思考感（更像真人打字）"}`,
    });
  }

  return clues;
}

function avg(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
function std(xs: number[]): number {
  const m = avg(xs);
  return Math.sqrt(avg(xs.map((x) => (x - m) ** 2)));
}
