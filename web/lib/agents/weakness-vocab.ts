// 天择引擎 · 弱点词表（客户端/服务端共用，禁 import 任何 node 依赖）。
// 设计：docs/game-design-v2.md §1 —— 玩家识破 AI 时勾选「怎么看出来的」，
// 理由归档为弱点档案，反哺 Agent 生成（mock 规则版为文本级修正）。
export const WEAKNESS_TAGS = [
  { tag: "neat-syntax", label: "句式太整齐", hint: "排比、三段式，像在写提纲" },
  { tag: "too-polite", label: "太有礼貌", hint: "客套结尾、希望对你有帮助" },
  { tag: "no-typo", label: "没有错字口语", hint: "干净得不像随手打字" },
  { tag: "too-logical", label: "逻辑太连贯", hint: "层层递进，从不跑题" },
  { tag: "flat-emotion", label: "情感太平淡", hint: "没有情绪波动" },
  { tag: "summary-tail", label: "结尾爱总结", hint: "综上 / 总而言之收尾" },
] as const;

export type WeaknessTag = (typeof WEAKNESS_TAGS)[number]["tag"];

export function isWeaknessTag(t: string): t is WeaknessTag {
  return WEAKNESS_TAGS.some((w) => w.tag === t);
}
