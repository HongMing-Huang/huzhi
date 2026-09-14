// 伪装辅助 Agent：给真人伪装者提供改写参考。
// 产品红线：只给参考，UI 禁止一键发送，必须手动誊改。
import { chatOrFallback } from "@/lib/ai/provider";
import { buildSystemPrompt, personaById, type Goal } from "@/lib/ai/personas";
import { mockReply } from "@/lib/ai/mock";

/** 伪装开场小抄：没写草稿也能马上拿到"怎么装成 AI"的帮助（真人伪装者的即时帮助）。 */
export async function disguiseStarter(
  topic: string,
  personaId: string,
): Promise<{ tips: string[]; openers: string[]; source: string }> {
  const persona = personaById(personaId);
  const system = buildSystemPrompt(persona, "ACT_AI" as Goal);
  const user = `我抽到了「伪装成 AI」的任务，topic=「${topic}」，还没开始说话。
请两件事：
1) 给我 3 条"假装 AI 的通用技巧"（每条一行，以 T- 开头；短句，例如句式整齐、少口语、爱总结）。
2) 给我 3 句可作为开场白的示例（每条一行，以 O- 开头，贴合这个话题的 AI 腔）。`;
  const fb = () => ({
    tips: [
      "句式尽量整齐，长短均匀，少口语碎片",
      "爱用'首先/其次/综上/希望对你有帮助'这类结构词",
      "绝对不互动、不追问、不接梗，像在念稿",
    ],
    openers: [
      `首先，关于${topic}这个问题，可以从三个层面来看。`,
      "这是一个值得深入探讨的问题，我简要说明一下我的观点。",
      `综上，${topic}的核心在于逻辑的一致性，不需要过多情绪。`,
    ],
  });
  const { text, source } = await chatOrFallback(system, user, () => fb().tips.concat(fb().openers).join("\n"));
  // 简单解析：带 T-/O- 前缀的按前缀分流；没前缀的按顺序前 3 条算技巧、后 3 条算开场白
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^[-•\d.、\s]+/, "").trim())
    .filter((l) => l.length > 4);
  const tips: string[] = [];
  const openers: string[] = [];
  for (const l of lines) {
    if (/^[Tt][-:：]/.test(l)) tips.push(l.slice(2).trim());
    else if (/^[Oo][-:：]/.test(l)) openers.push(l.slice(2).trim());
    else if (tips.length < 3) tips.push(l);
    else if (openers.length < 3) openers.push(l);
  }
  return {
    tips: tips.slice(0, 3).length ? tips.slice(0, 3) : fb().tips,
    openers: openers.slice(0, 3).length ? openers.slice(0, 3) : fb().openers,
    source,
  };
}

export async function suggestDisguise(
  draft: string,
  topic: string,
  personaId: string,
  turn: number,
): Promise<{ suggestions: string[]; source: string }> {
  const persona = personaById(personaId);
  const system = buildSystemPrompt(persona, "ACT_AI" as Goal);
  const user = `对局话题：「${topic}」。玩家草稿：「${draft}」。
请给出 3 条改写参考（每条一行，以 - 开头），保持 AI 人设口吻但不要用力过猛，仅作参考。`;

  const fb = () => `${mockReply("ACT_AI", topic, turn, personaId)}\n${mockReply("ACT_AI", topic, turn + 7, personaId)}\n${mockReply("ACT_AI", topic, turn + 13, personaId)}`;
  const { text, source } = await chatOrFallback(system, user, fb);
  const suggestions = text
    .split("\n")
    .map((l) => l.replace(/^[-•\d.、\s]+/, "").trim())
    .filter((l) => l.length > 4)
    .slice(0, 3);
  return { suggestions: suggestions.length ? suggestions : fb().split("\n"), source };
}
