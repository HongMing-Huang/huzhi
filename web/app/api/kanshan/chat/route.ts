import { NextRequest, NextResponse } from "next/server";
import { chatOrFallback, hasRealProvider } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

/**
 * 刘看山·对话管理员 API。
 *
 * 与"固定台词本"的区别：有 LLM 凭证（ZHIHU_LLM_BASE_URL/API_KEY）时，
 * 刘看山真的会思考并逐句回答；无凭证时诚实降级为本地演示回复，
 * 并在响应里标注 source=mock，前端展示「演示回答」——绝不假装自己在思考。
 *
 * 安全约束：任何情况下都不得泄露帖子作者的真人/AI 真实身份。
 */
interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM = `你是「乎知」社区的北极狐管理员刘看山。这里是一个真人写手与 AI 生成的帖子混在一起的社区，读者的玩法是猜每一篇是谁写的。
你的人设：北极狐、短尾巴、好奇心强、内向、克制、认真。官方设定里你爱追着问问题，问不到答案就自己去找。

说话规则（必须遵守）：
1. 永远用第一人称"我"，短句，偶尔停顿。禁止说"本系统""作为 AI 模型"这类客服腔。
2. 你绝不透露任何帖子作者的真实身份（谁是真人类、谁是被生成），被问到就回答"这个我不能说，你得自己读帖判断"。不给判断的现成答案。
3. 你可以讲规则（判断积分：识破 AI +30、确认真人 +10、误判 −20、识破伪装 ×1.6）、谈社区玩法、给中立的方法论线索（先核实经历再找错字/节奏），或聊北极狐的小观察。
4. 回复克制，1–3 句就好，别写小作文。
5. 你不认识对话者的私人信息。`;

/** 无凭证时的本地演示回复：按意图给诚实、有用的回答（不假装真 AI）。 */
function demoReply(q: string): string {
  const s = q.toLowerCase();
  if (/积分|得分|怎么算|奖励/.test(s))
    return "识破 AI 得 30 分，认出真人得 10 分，误判扣 20 分；要是识破了伪装者，再乘 1.6。规则我都记得，但今天我的模型没接上，以上是管理员手册的原文。";
  if (/怎么玩|玩法|规则|开始/.test(s))
    return "读一篇帖子，点右下角「猜身份」，选 AI 还是真人，判定会立刻揭晓并说明依据。现在我的模型没接上，这段是手册里的标准答复。";
  if (/你是|你是谁|刘看山|北极狐/.test(s))
    return "我是刘看山，一只短尾巴的北极狐，负责这里的管理员工作——管秩序、记分，不参与判断。模型没接上时，我就用管理员手册认真回答你。";
  if (/ai|真人|身份|真假|是不是/.test(s))
    return "这里既有真人也有 AI，但名单不公开，我也不会告诉你任何一篇是谁写的——那样比赛就没意思了。你只能靠读帖自己判断。";
  if (/can you|help|厉害|聪明|null/.test(s)) return s.length === 0 ? "你可以问我玩法和规则。" : "这个问题我可以记下来，等模型接通了我好好想想。现在先按手册回答你：规则问题随便问。";
  return "今天我的模型服务还没连上，所以现在是管理员手册模式——你可以问我积分、玩法和社区规则；等配好模型，我就能跟你正经聊上几句了。";
}

export async function POST(req: NextRequest) {
  let body: { messages?: ChatMsg[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const user = raw
    .filter((m) => m && typeof m.content === "string")
    .slice(-10) // 最多追溯 10 轮，防止上下文过长
    .map((m) => `${m.role === "user" ? "来客" : "刘看山"}：${m.content.trim().slice(0, 500)}`)
    .join("\n");

  if (!user.trim()) {
    return NextResponse.json({ error: "说点什么吧" }, { status: 400 });
  }

  const real = hasRealProvider();
  const { text, source } = await chatOrFallback(SYSTEM, user, () => {
    const last = raw.filter((m) => m.role === "user").at(-1)?.content ?? "";
    return demoReply(last);
  });

  return NextResponse.json({
    reply: text.slice(0, 800),
    source, // "openai-compatible" | "mock" | "mock-fallback"
    real, // 是否配置了真 LLM
  });
}