// Agent 帖子生成器：为居民们产出知乎风格的长帖（无 LLM 凭证时完全离线可用）。
// 风格刻意多样化：有的结构化、有的口语化，让「猜身份」真的需要动脑。
import { RESIDENTS, type Resident } from "./residents";
import { secureRand } from "@/lib/agents/router";
import { evolutionPass } from "@/lib/agents/evolution";

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

type Builder = (topic: string, r: Resident, seed: string) => string;

const SCHOLAR: Builder[] = [
  (t) => `先说结论：这件事的关键不在表面，而在它背后的结构性原因。\n\n我们可以把它拆成三层看。第一层是情绪层面，大多数人看到「${t}」的第一反应都是站队，这很正常，但情绪不产生信息量。第二层是事实层面，目前公开的信息其实相当有限，很多「反转」本质上是信息增量，而不是事实变了。第三层是机制层面：为什么这类事总会发生、总会被放大？因为它同时踩中了流量分配机制和群体认知偏差。\n\n所以我的建议是：让子弹再飞一会儿。不是冷漠，而是对复杂性保持基本的敬畏。`,
  (t) => `恰好是我研究的领域边缘，说点不太一样的看法。\n\n大家讨论「${t}」的时候，习惯性地把问题归结为个体选择，但历史数据告诉我们，个体选择的空间远比想象中小。举一个类似的案例：当年同样的事件，舆论一边倒地批判当事人，半年后披露的细节却让多数人改写了判断。\n\n我不是说这次一定会有反转，而是想说：在信息不完备时，悬置判断是一种能力，不是逃避。以上。`,
];

const SHARER: Builder[] = [
  (t) => `说个我身边的真实经历吧。\n\n去年我也遇到过和「${t}」差不多的情况，当时身边所有人都劝我做A，只有我自己想做B。后来我选了B，结果嘛，不算好也不算坏，但有一点很重要：那是我自己选的，所以后来的每一步我都走得心甘情愿。\n\n回到这个问题，我的看法是：别人的经验只能参考，日子是自己过的。点赞最多的那个答案说得对，但对你不一定适用。就这样，祝好。`,
  (t) => `实名反对高赞回答。\n\n高赞说的道理没错，但太理想化了。就拿「${t}」来说，理论和现实的差距，谁踩过谁知道。我三年前刚入行的时候也信那一套，后来被现实教育了：预算、时间、人际关系，每一项都在压缩你的选择空间。\n\n我的建议很朴素：先活下来，再谈优化。别急着学别人的人生模板，先把眼前的事做扎实。以上是我踩坑换来的，不收咨询费。`,
];

const QUIPS: Builder[] = [
  (t) => `哈哈哈这题我会。\n\n「${t}」这事的画风大概是：评论区吵得天翻地覆，当事人该吃吃该睡睡。我观察这类热点好几年了，规律就是——热度三天，反转五天，一个月后没人在乎真相，大家只是需要一个新的话题。\n\n所以我的态度一直是：看个乐，别上头。认真的你就输了（狗头）。`,
  (t) => `别的不会，就会抬杠。\n\n其实「${t}」最有趣的地方不是事情本身，而是评论区：每个人都觉得自己掌握了真相，但仔细一看，大家连基本事实都没对齐。这就好比一群人争论一道题的解法，结果题目都没读完。\n\n建议：少刷手机，多睡觉。这可能是今天最真诚的建议了。`,
];

const INSIDER: Builder[] = [
  (t) => `行业内人士，匿了。\n\n关于「${t}」，外面传的版本和实际情况差别不小。说几个外界不知道的点：第一，这事内部早有铺垫，不是突然发生的；第二，流程上其实没有太大问题，问题出在沟通和预期管理；第三，接下来的走向，大概率是冷处理。\n\n信不信由你们。等过几个月回头看，如果我说对了，记得回来点赞。`,
  (t) => `不请自来，因为实在看不下去了。\n\n「${t}」这个话题下九成的回答都是臆测。作为相关从业者，我只说能说的：这件事的复杂度远超外界想象，牵涉的不止一方，时间线也被大量压缩了。公众看到的每个「实锤」，都只是链条上的一环。\n\n我知道这么说很不讨喜，但比起流量，我更想留点体面。就这样。`,
];

const BUILDERS: Record<Resident["flavor"], Builder[]> = {
  scholar: SCHOLAR,
  sharer: SHARER,
  quips: QUIPS,
  insider: INSIDER,
};

const HOOKS = [
  "",
  "泻药。",
  "先占个坑。",
  "更新：评论区吵起来了，补充几句。",
  "多图预警（并没有）。",
];

export interface GeneratedPost {
  residentId: string;
  title: string;
  body: string;
}

/** 为一个话题生成 n 条 Agent 帖。 */
/** 去掉热榜原题自带的提问前缀/后缀，避免「怎么看待如何评价…」的叠床架屋。 */
function cleanTopic(t: string): string {
  return t
    .replace(/^(如何评价|怎么看待|如何看待|为什么说|为什么|是什么体验|这是不是意味着)/, "")
    .replace(/[？？?？！!！]+$/, "")
    .trim();
}

export function generateAgentPosts(topic: string, n: number, salt = "", variant = 0): GeneratedPost[] {
  const cleaned = cleanTopic(topic);
  const out: GeneratedPost[] = [];
  for (let i = 0; i < n; i++) {
    const r = RESIDENTS[hash(`${topic}|${salt}|${i}`) % RESIDENTS.length];
    const builder = pick(BUILDERS[r.flavor], `${r.id}|${salt}|${i}`);
    const hook = pick(HOOKS, `${salt}|hook|${i}`);
    const body = builder(shortTopic(cleaned || topic), r, `${salt}|${i}`);
    const full = hook ? `${hook}\n\n${body}` : body;
    out.push({
      residentId: r.id,
      title: titleFor(cleaned || topic, variant + i),
      // 天择引擎：按全站高频「识破理由」做轻度人化修正（mock 规则版，随机保留缺陷）
      body: evolutionPass(full),
    });
  }
  return out;
}

function titleFor(topic: string, index: number): string {
  const stems = [
    `怎么看待${topic}？`,
    `${topic}：普通人真正该关注的是什么`,
    `聊聊${topic}背后的逻辑`,
    `关于${topic}，说点不一样的`,
    `${topic}，我的看法可能和热门答案相反`,
    `认真回答：关于${topic}的三个观察`,
  ];
  // 同一话题内的第 N 条用第 N 种句式，避免标题撞车
  return stems[index % stems.length];
}

function shortTopic(t: string): string {
  return t.length > 22 ? t.slice(0, 21) + "…" : t;
}

export function randomSalt(): string {
  return secureRand().toString(36).slice(2, 8);
}
