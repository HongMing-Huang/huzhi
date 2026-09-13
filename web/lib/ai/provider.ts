// LLM Provider：OpenAI 兼容网关优先，无凭证/失败一律回退 mock 生成器。
// 凭证只从环境变量读取，超时 25s，密钥绝不发给客户端。
// 无任何 shell/子进程调用，仅 HTTPS fetch。

import type { LLMProvider } from "./provider-types";

const DEFAULT_TIMEOUT_MS = 25000;

/** 仅允许 https 且非环回/私有/保留地址（防 SSRF）。 */
export function assertPublicHttpsUrl(raw: string): URL {
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:") {
    throw new Error("only https is allowed");
  }
  const host = parsed.hostname;
  const isIpLiteral = /^[0-9.]+$/.test(host);
  if (isIpLiteral) {
    const parts = host.split(".").map(Number);
    const [a, b] = parts;
    const blocked =
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224;
    if (blocked) throw new Error("private or reserved address rejected");
  } else if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("local hostnames rejected");
  }
  return parsed;
}

class OpenAICompatProvider implements LLMProvider {
  readonly name = "openai-compatible";
  constructor(private readonly endpoint: URL, private readonly apiKey: string, private readonly model: string) {}

  async chat(system: string, user: string, signal?: AbortSignal): Promise<string> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.9,
        max_tokens: 400,
      }),
      signal: signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`llm http ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("llm empty");
    return text;
  }
}

/** 确定性 mock：不做网络调用，保证无凭证/断网时对局不中断。 */
class MockProvider implements LLMProvider {
  readonly name = "mock";
  async chat(): Promise<string> {
    // 正常路径应走 lib/ai/mock.ts 语料池；此方法仅为接口兜底。
    return "（演示内容）我先看看这个话题……";
  }
}

export function getProvider(): LLMProvider {
  const base = process.env.ZHIHU_LLM_BASE_URL;
  const key = process.env.ZHIHU_LLM_API_KEY;
  if (base && key) {
    try {
      const endpoint = assertPublicHttpsUrl(new URL("chat/completions", `${base.replace(/\/+$/, "")}/`).toString());
      return new OpenAICompatProvider(endpoint, key, process.env.ZHIHU_LLM_MODEL || "gpt-4o-mini");
    } catch {
      // 配置了非法地址则视为无凭证，回退 mock
    }
  }
  return new MockProvider();
}

export function hasRealProvider(): boolean {
  return Boolean(process.env.ZHIHU_LLM_BASE_URL && process.env.ZHIHU_LLM_API_KEY);
}

/** 尝试真 LLM，失败回退 mock 语料。 */
export async function chatOrFallback(
  system: string,
  user: string,
  fallback: () => string,
): Promise<{ text: string; source: string }> {
  const provider = getProvider();
  if (provider instanceof MockProvider) return { text: fallback(), source: "mock" };
  try {
    return { text: await provider.chat(system, user), source: provider.name };
  } catch {
    return { text: fallback(), source: "mock-fallback" };
  }
}
