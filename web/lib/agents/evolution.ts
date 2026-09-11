// 天择引擎（设计 docs/game-design-v2.md §1）：
//   识破理由 → weakness_notes 集合 → 高频弱点 → 生成时文本级修正（mock 规则版）。
// 学术依据：Reflexion / ExpeL / humanize-text（收集→压缩→注入→度量，均无需微调）。
// 反失控护栏：每次最多 3 条规则、一半帖子原样放行——Agent 永不「毕业」成完美人类，
// 否则玩法死亡（调研结论 #4，与 Human or Not 论文的 bot 故意带错字同理）。
import { loadCollection, saveCollection } from "@/lib/db";
import { secureRand } from "@/lib/agents/router";
import { isWeaknessTag, type WeaknessTag } from "./weakness-vocab";

export { WEAKNESS_TAGS, isWeaknessTag } from "./weakness-vocab";
export type { WeaknessTag } from "./weakness-vocab";

export interface WeaknessNote {
  id: string;
  postId: string;
  authorName: string; // 服务端内部归档用，绝不进客户端视图
  tag: WeaknessTag;
  note?: string;
  byUser?: string; // 筹码桌 key（登录 user:<id> 或游客 feed:<uid>），每帖一次去重用
  createdAt: number;
}

const NOTES_CAP = 2000; // 防内存失控（与 feed 池同思路）

function notes(): WeaknessNote[] {
  return loadCollection<WeaknessNote[]>("weakness_notes", []);
}

function saveAll(list: WeaknessNote[]) {
  if (list.length > NOTES_CAP) list = list.slice(list.length - NOTES_CAP);
  saveCollection("weakness_notes", list);
}

export function hasNotedBy(postId: string, byUser: string): boolean {
  return notes().some((n) => n.postId === postId && n.byUser === byUser);
}

export function recordWeakness(input: {
  postId: string;
  authorName: string;
  tag: WeaknessTag;
  note?: string;
  byUser?: string;
}): void {
  const list = notes();
  list.push({
    id: `wn_${Date.now().toString(36)}_${secureRand().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    ...input,
    note: input.note?.trim().slice(0, 200) || undefined,
  });
  saveAll(list);
}

/** 高频弱点（默认全站共享档案；ExpeL：跨 Agent 共享 insights）。 */
export function topWeaknessTags(limit = 3, authorName?: string): { tag: WeaknessTag; count: number }[] {
  const list = notes().filter((n) => !authorName || n.authorName === authorName);
  const counts = new Map<WeaknessTag, number>();
  for (const n of list) counts.set(n.tag, (counts.get(n.tag) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

/**
 * mock 规则版「禁则注入」：按高频弱点对生成文本做轻度人化修正。
 * 每条规则只做一处小改动 + 随机跳过一半帖子——刻意保留缺陷（护栏）。
 */
export function evolutionPass(body: string): string {
  const tags = topWeaknessTags(3).map((t) => t.tag);
  if (tags.length === 0) return body;
  if (secureRand() < 0.5) return body; // 护栏：一半原样放行

  let text = body;
  for (const tag of tags) {
    switch (tag) {
      case "summary-tail":
      case "too-polite":
        text = text.replace(/(以上。|希望对你有帮助。?|祝好。)/, "").replace(/综上[，,]?/, "所以");
        break;
      case "no-typo":
        if (secureRand() < 0.5) text = text.replace(/。/, "。。");
        else text = text.replace(/。/, "吧。");
        break;
      case "flat-emotion":
        if (secureRand() < 0.5) text = text.replace(/([。！？])/, "$1（笑）");
        break;
      case "neat-syntax":
        text = text.replace(/第一[，,]/, "先说一个——").replace(/第二[，,]/, "还有，");
        break;
      case "too-logical":
        text = text.replace(/\n\n/, "\n\n（跑个题，刚看到这条推送有点绷不住）\n\n");
        break;
    }
  }
  return text === body ? body : text;
}

/** 弱点档案概览（调试/演示「天择」叙事用）。 */
export function weaknessStats(): { total: number; top: { tag: WeaknessTag; count: number }[] } {
  return { total: notes().length, top: topWeaknessTags(5) };
}
