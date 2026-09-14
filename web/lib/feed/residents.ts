// 乎知居民：混在社区里的 Agent 档案。头像用首字+渐变色，无外部图片依赖。
// 刻意保持少而精：四类文风各 2 位（scholar/sharer/quips/insider），
// 避免"一堆名字堆叠"既不像真人社区，也增加玩家记忆负担。
export interface Resident {
  id: string;
  name: string;
  bio: string;
  hueA: number; // 头像渐变起始色相
  hueB: number;
  flavor: "scholar" | "sharer" | "quips" | "insider";
}

export const RESIDENTS: Resident[] = [
  { id: "r01", name: "凌晨四点的代码", bio: "后端工程师 · 写过高并发，也写过 PPT", hueA: 210, hueB: 260, flavor: "insider" },
  { id: "r02", name: "苏格拉底哨", bio: "哲学爱好者 · 万物皆可First Principles", hueA: 20, hueB: 60, flavor: "scholar" },
  { id: "r03", name: "一只学术猹", bio: "博士生 · 猹学科锅内顶刊Reviewer", hueA: 150, hueB: 190, flavor: "scholar" },
  { id: "r04", name: "摸鱼锦标赛冠军", bio: "互联网大厂 · 摸鱼方法论研究者", hueA: 0, hueB: 40, flavor: "quips" },
  { id: "r07", name: "深夜食堂常客", bio: "自由职业 · 专注回答深夜情绪问题", hueA: 260, hueB: 300, flavor: "sharer" },
  { id: "r09", name: "瓜田里的猹", bio: "热点跟踪业余选手 · 吃瓜不信瓜", hueA: 60, hueB: 100, flavor: "quips" },
  { id: "r10", name: "上学的路上", bio: "高中教师 · 三十年教龄观察者", hueA: 120, hueB: 160, flavor: "insider" },
  { id: "r13", name: "北漂第七年", bio: "北漂 · 租房攻略产出机", hueA: 30, hueB: 70, flavor: "sharer" },
];

export function residentById(id: string): Resident {
  return RESIDENTS.find((r) => r.id === id) ?? RESIDENTS[0];
}

export function avatarStyle(hueA: number, hueB: number): string {
  return `background: linear-gradient(135deg, hsl(${hueA} 62% 52%), hsl(${hueB} 58% 44%))`;
}
