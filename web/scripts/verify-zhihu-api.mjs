#!/usr/bin/env node
// 知乎开放平台六接口直连检验脚本（检验流程第 2 步，见 docs/verification-runbook.md）。
//
// 用法：cd web && node scripts/verify-zhihu-api.mjs
// 前提：web/.env.local 配置了 ZHIHU_ACCESS_SECRET。
//
// 做什么：
//   1. 读 .env.local（不进 shell 历史，不打印密钥值）
//   2. 记录检验前额度快照（quota 接口本身不消耗额度）
//   3. 逐个实调六大能力，校验信封 Code=0 与响应形状
//   4. 问题回答的热榜联动：用热榜第一条问题链接取回答，验证链路而非写死题目
//   5. 输出检验后额度快照（= 本次检验的真实消耗），全过退出码 0
//
// 消耗：每项能力 1 次调用（热榜 1/100、搜索类各 1/5000、直答 1/5000……），
//      日常检验可放心跑；额度紧张时先看第 3 步输出的剩余量再决定。

import { readFileSync } from "node:fs";

const API_BASE = "https://developer.zhihu.com/api/v1";
const CHAT_ENDPOINT = "https://developer.zhihu.com/v1/chat/completions";

// ---------- 凭证加载（只进内存，永不打印） ----------
function loadSecret() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const m = raw.match(/^ZHIHU_ACCESS_SECRET=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

const SECRET = loadSecret();
if (!SECRET) {
  console.error("✗ 未在 web/.env.local 找到 ZHIHU_ACCESS_SECRET，无法做直连检验。");
  console.error("  （无凭证时应用本身走本地语料降级，属正常运行，但本脚本无从检验真实链路）");
  process.exit(2);
}

function headers() {
  return {
    Authorization: `Bearer ${SECRET}`,
    "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
    "Content-Type": "application/json",
  };
}

async function apiGet(path, params = {}) {
  const url = new URL(`${API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.Code !== 0) throw new Error(`Code=${json.Code} ${json.Message ?? ""}`.trim());
  return json.Data;
}

// ---------- 检验项 ----------
const results = [];
async function check(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    const shown = typeof detail === "string" ? detail : (detail?.text ?? JSON.stringify(detail));
    results.push({ name, ok: true, detail, ms: Date.now() - t0 });
    console.log(`  ✓ ${name}（${Date.now() - t0}ms）— ${shown}`);
  } catch (e) {
    results.push({ name, ok: false, detail: String(e.message || e), ms: Date.now() - t0 });
    console.log(`  ✗ ${name}（${Date.now() - t0}ms）— ${e.message ?? e}`);
  }
}

async function quotaSnapshot() {
  const rows = await apiGet("quota");
  const pick = (id) => rows.find((r) => r.APIID === id);
  const fmt = (id) => {
    const r = pick(id);
    return r ? `${r.RemainingQuota}/${r.TotalQuota}` : "无此项";
  };
  return {
    rows,
    text: ["hot_list", "zhihu_search", "global_search", "question_answers", "creator", "zhida_openai"]
      .map((id) => `${id}=${fmt(id)}`)
      .join("  "),
  };
}

console.log("── 知乎开放平台六接口直连检验 ──────────────────────────");
console.log(`时间：${new Date().toLocaleString("zh-CN")}（消耗以「检验后 − 检验前」额度为准）\n`);

console.log("[0] 检验前额度快照");
const before = await check("GET /api/v1/quota（不消耗额度）", quotaSnapshot).then(() => results.at(-1));
const beforeSnap = before?.detail?.text ?? "";
console.log(`    ${beforeSnap}\n`);

console.log("[1] 六大能力逐一实调");

let firstQuestionUrl = null;
await check("知乎热榜 hot_list", async () => {
  const data = await apiGet("content/hot_list", { Limit: 5 });
  const items = data.Items ?? [];
  if (items.length === 0) throw new Error("Items 为空");
  firstQuestionUrl = items.map((i) => i.Url ?? "").find((u) => /^https:\/\/www\.zhihu\.com\/question\/\d+/.test(u)) ?? null;
  return `${items.length} 条，首条「${items[0].Title.slice(0, 18)}…」${firstQuestionUrl ? "，含问题链接可联动" : "，无可联动的问题链接"}`;
});

await check("知乎搜索 zhihu_search", async () => {
  const data = await apiGet("content/zhihu_search", { Query: "人工智能", Count: 3 });
  const items = data.Items ?? [];
  if (items.length === 0) throw new Error("Items 为空");
  const it = items[0];
  for (const f of ["Title", "ContentText", "Url", "AuthorName"]) {
    if (!(f in it)) throw new Error(`缺字段 ${f}`);
  }
  return `${items.length} 条，字段齐全`;
});

await check("全网搜索 global_search", async () => {
  const data = await apiGet("content/global_search", { Query: "图灵测试", Count: 3 });
  const items = data.Items ?? [];
  if (items.length === 0) throw new Error("Items 为空");
  return `${items.length} 条，首条来源 ${(items[0].Url ?? "").slice(0, 40)}`;
});

await check("直答 zhida /v1/chat/completions", async () => {
  const res = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      model: "zhida-fast-1p5",
      messages: [{ role: "user", content: "用一句话回答：什么是图灵测试？" }],
      stream: false,
    }),
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "直答返回 error");
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("choices[0].message.content 为空");
  return `「${content.slice(0, 24)}…」（model=${json.model ?? "?"}）`;
});

await check("问题推荐 question_recommendations（主题模式）", async () => {
  const data = await apiGet("user/question_recommendations", { Query: "人工智能", Count: 3 });
  const items = data.Items ?? [];
  if (items.length === 0) throw new Error("Items 为空");
  return `${items.length} 条，首条「${items[0].Title.slice(0, 18)}…」`;
});

await check("问题回答 question_answers（联动热榜链接）", async () => {
  if (!firstQuestionUrl) throw new Error("SKIP：热榜无问题链接，无法联动检验（非接口故障）");
  const data = await apiGet("content/question_answers", {
    QuestionUrl: firstQuestionUrl,
    Offset: 0,
    Limit: 5,
  });
  const items = data.Items ?? [];
  // 文档：无摘要的回答会被过滤，条数可能少于 Limit 甚至为空——空不算失败，
  // 但 Paging 必须存在且 IsEnd 有值才算响应形状正确。
  const paging = data.Paging ?? {};
  if (typeof paging.IsEnd !== "boolean") throw new Error("Paging.IsEnd 缺失");
  return `问题「${decodeURIComponent(firstQuestionUrl.split("/").pop())}」取回 ${items.length} 条回答，IsEnd=${paging.IsEnd}`;
});

console.log("\n[2] 检验后额度快照（本次检验真实消耗 = 检验前相减）");
const after = await check("GET /api/v1/quota（不消耗额度）", quotaSnapshot).then(() => results.at(-1));
console.log(`    ${after?.detail?.text ?? ""}\n`);

const isSkip = (r) => typeof r.detail === "string" && r.detail.startsWith("SKIP");
const passed = results.filter((r) => r.ok && !isSkip(r)).length;
const skipped = results.filter((r) => r.ok && isSkip(r)).length;
const failed = results.filter((r) => !r.ok).length;

console.log("──────────────────────────────────────────────────────");
console.log(
  `结果：${passed} 过 / ${skipped} 跳过 / ${failed} 败` +
    (failed === 0 ? " ✅ 检验通过" : " ❌ 存在失败项，请先看上方 ✗ 的具体原因"),
);
process.exit(failed === 0 ? 0 : 1);
