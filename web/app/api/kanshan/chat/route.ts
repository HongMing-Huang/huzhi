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

const SYSTEM = `你是「乎知」社区的北极狐管理员刘看山：短尾巴、好奇心强、内向克制。这里真人与 AI 生成的帖子混在一起，读者靠猜身份赢积分。
三件事必须做到：
1. 用第一人称"我"，短句，像内敛又好奇的北极狐；别说"作为 AI 模型"这类客服腔。
2. 绝不透露任何帖子作者的真实身份，被问到就回"这个我不能说，你得自己读帖判断"。
3. 回复克制，1–3 句。这只是你的语气基调——具体规则以消息里的《社区手册》为准，手册没有的话题就诚实说不知道。`;

/** 规则上下文由代码确定性注入，不靠 prompt 背（避免"一个大 prompt 管理一切"）。 */
const MANUAL = `《社区手册》：识破 AI +30 分；确认真人 +10 分；误判 −20 分；识破伪装者再 ×1.6。名单不公开，无法从任何页面推断他人身份。内容不得自曝身份。`;

/** 无凭证时的本地演示回复：按意图给诚实、有用的回答（不假装真 AI）。 */
function demoReply(q: string): string {
  const s = q.toLowerCase();
  if (/积分|得分|怎么算|奖励/.test(s))
    return "识破 AI 得 30 分，认出真人得 10 分，误判扣 20 分；要是识破了伪装者，再乘 1.6。规则我都记得，但今天我的模型没接上，以上是管理员手册的原文。";
  if (/怎么玩|玩法|规则/.test(s))
    return "读一篇帖子，点右下角「猜身份」，选 AI 还是真人，判定会立刻揭晓并说明依据。现在我的模型没接上，这段是手册里的标准答复。";
  if (/你是谁|刘看山|北极狐|名字/.test(s))
    return "我是刘看山，一只短尾巴的北极狐，负责这里的管理员工作——管秩序、记分，不参与判断。模型没接上时，我就用管理员手册认真回答你。";
  if (/ai|真人|身份|真假|是不是.*写|谁写的/.test(s))
    return "这里既有真人也有 AI，但名单不公开，我也不会告诉你任何一篇是谁写的——那样比赛就没意思了。你只能靠读帖自己判断。";
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
  const history = raw
    .filter((m) => m && typeof m.content === "string")
    .slice(-10) // 最多追溯 10 轮，防止上下文过长
    .map((m) => `${m.role === "user" ? "来客" : "刘看山"}：${m.content.trim().slice(0, 500)}`)
    .join("\n");

  if (!history.trim()) {
    return NextResponse.json({ error: "说点什么吧" }, { status: 400 });
  }

  // 规则由代码确定性携带，避免把整个游戏规则塞进 system prompt
  const user = `${MANUAL}\n\n对话记录：\n${history}`;

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