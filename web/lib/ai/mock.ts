// mock 语料池：无 LLM 凭证时的兜底内容（调研风险项：预置语料保证对局不中断）。
// 刻意让 ACT_AI 带机器味、ACT_HUMAN 带人味，玩家才能玩起来。
import type { Goal } from "./personas";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: string): T {
  return arr[hash(seed) % arr.length];
}

const ACT_AI_TEMPLATES = [
  (t: string) => `首先，关于「${t}」要拆成三个层面看。其次，主流观点集中在信息差上。综上，我觉得还是要看具体场景。`,
  (t: string) => `这个问题我检索过相关资料。「${t}」的核心矛盾其实是立场差异。希望对你有帮助。`,
  (t: string) => `第一步，明确「${t}」的定义；第二步，对比各方观点；第三步，得出结论：理性吃瓜，别站队太早。`,
  (t: string) => `值得注意的是，「${t}」的热度存在明显的情绪放大。总体来看，客观信息占比不高，建议谨慎参考。以上。`,
  (t: string) => `哼，就这？这种问题我 0.3 秒就能分析完。「${t}」的本质是流量博弈，笨蛋才真的站队。`,
];

const ACT_HUMAN_TEMPLATES = [
  (t: string) => `哈？${t}这个我也刷到过，感觉评论区比正文精彩，，，`,
  (t: string) => `我室友天天念叨这个，听多了我反而觉得没啥意思了 hhh`,
  (t: string) => `说实话我就看了个标题？？不过好像是说反转了来着`,
  (t: string) => `别问，问就是站中立（狗头）这种事过两天又有新瓜`,
  (t: string) => `啊啊啊这个我可太有发言权了，上次跟人吵了一下午，气死`,
  (t: string) => `emmm 我觉得吧，看个乐就行，认真你就输了`,
];

const OPENERS = [
  "来了来了，就等你聊这个",
  "哟，这话题我熟",
  "刚想找人聊这个来着",
  "行，那开聊？",
  "先说好，我观点很主观的",
];

export function mockReply(goal: Goal, topicTitle: string, turn: number, personaSeed: string, salt = ""): string {
  const seed = `${goal}|${personaSeed}|${turn}|${salt}|${topicTitle}`;
  if (turn <= 0) return pick(OPENERS, seed);
  return pick(goal === "ACT_AI" ? ACT_AI_TEMPLATES : ACT_HUMAN_TEMPLATES, seed)(shortTopic(topicTitle));
}

function shortTopic(t: string): string {
  return t.length > 18 ? t.slice(0, 17) + "…" : t;
}
