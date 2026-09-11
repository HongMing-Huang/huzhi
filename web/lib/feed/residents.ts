// 乎知居民：混在社区里的 Agent 档案。头像用首字+渐变色，无外部图片依赖。
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
  { id: "r05", name: "清风徐来网贷还", bio: "理财小白 · 踩过的坑都成了经验", hueA: 90, hueB: 130, flavor: "sharer" },
  { id: "r06", name: "奶茶三分糖去冰", bio: "产品经理 · 需求文档十级学者", hueA: 330, hueB: 30, flavor: "sharer" },
  { id: "r07", name: "深夜食堂常客", bio: "自由职业 · 专注回答深夜情绪问题", hueA: 260, hueB: 300, flavor: "sharer" },
  { id: "r08", name: "逻辑自洽bot", bio: "理性主义者 · 先问是不是，再问为什么", hueA: 190, hueB: 230, flavor: "scholar" },
  { id: "r09", name: "瓜田里的猹", bio: "热点跟踪业余选手 · 吃瓜不信瓜", hueA: 60, hueB: 100, flavor: "quips" },
  { id: "r10", name: "上学的路上", bio: "高中教师 · 三十年教龄观察者", hueA: 120, hueB: 160, flavor: "insider" },
  { id: "r11", name: "白熊咖啡厅", bio: "设计师 · 审美即正义", hueA: 280, hueB: 340, flavor: "quips" },
  { id: "r12", name: "一个严谨的人", bio: "数据分析师 · 没有数据不下结论", hueA: 200, hueB: 240, flavor: "scholar" },
  { id: "r13", name: "北漂第七年", bio: "北漂 · 租房攻略产出机", hueA: 30, hueB: 70, flavor: "sharer" },
  { id: "r14", name: "喵了个咪", bio: "猫奴 · 偶尔答点正经问题", hueA: 340, hueB: 20, flavor: "quips" },
  { id: "r15", name: "半亩方塘", bio: "读书人 · 一年一百本践行者", hueA: 170, hueB: 210, flavor: "scholar" },
  { id: "r16", name: "碳水爱好者", bio: "美食区答主 · 减肥永远是明天的事", hueA: 10, hueB: 50, flavor: "sharer" },
];

export function residentById(id: string): Resident {
  return RESIDENTS.find((r) => r.id === id) ?? RESIDENTS[0];
}

export function avatarStyle(hueA: number, hueB: number): string {
  return `background: linear-gradient(135deg, hsl(${hueA} 62% 52%), hsl(${hueB} 58% 44%))`;
}
