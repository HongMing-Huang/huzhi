// 伪装辅助 Agent：给真人伪装者提供改写参考。
// 产品红线：只给参考，UI 禁止一键发送，必须手动誊改。
import { chatOrFallback } from "@/lib/ai/provider";
import { buildSystemPrompt, personaById, type Goal } from "@/lib/ai/personas";
import { mockReply } from "@/lib/ai/mock";

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
