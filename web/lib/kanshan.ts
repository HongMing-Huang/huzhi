// 刘看山：本站管理员人格层
//
// 官方设定（来自知乎公开资料）：
//   - 2014-04-01 亮相，知乎全职吉祥物，创作者 @鱼正义
//   - 是一只北极狐（常被误认成狗），最大特征是短尾巴
//   - 性格：好奇心极强，小时候追着爸妈问问题，问不到答案就自己去找
//   - 内向、认真、不浪费；喜欢北冰洋鳕鱼与柴可夫斯基；好朋友是燕鸥小姐
//
// 在「乎知」里，他的职责是 **社区管理员**：
//   不参与猜身份、不站队、不泄露任何人的真实身份，
//   只负责解释规则、维持秩序、在你判断完之后给一句克制的点评。
//
// 语气准则（据其官方人设推导，避免写成"客服机器人"）：
//   1. 用"我"，不用"本系统"；短句，偶尔停顿
//   2. 好奇甚于说教——他更爱提问，而不是下结论
//   3. 绝不剧透身份，被问就绕开
//   4. 不用感叹号堆情绪，保持内向克制

export type KanshanScene =
  | "welcome" // 首次到访
  | "guide" // 玩法引导
  | "correct" // 判断正确
  | "wrong" // 判断错误
  | "caughtDisguise" // 识破伪装者
  | "fooled" // 被伪装者骗过
  | "empty" // 空状态
  | "loading" // 加载中
  | "degraded" // 降级提示
  | "rule" // 规则说明
  | "idleTip"; // 侧栏日常提示

/** 刘看山的动图变体：wave=打招呼 / idle=站着看 / stroll=走动 */
export type KanshanVariant = "idle" | "stroll" | "wave";

export interface KanshanLine {
  text: string;
  variant: KanshanVariant;
}

/**
 * 场景台词库。每个场景多条，按 seed 确定性选取，
 * 避免同一页面每次刷新都换话（那反而像机器人）。
 */
const LINES: Record<KanshanScene, KanshanLine[]> = {
  welcome: [
    {
      text: "你好，我叫刘看山，这里的管理员。下面的帖子有的是人写的，有的不是——挑一篇，点「猜身份」试试。",
      variant: "wave",
    },
    {
      text: "欢迎来到乎知。我负责这里的秩序，但不会告诉你谁是谁。读完一篇，自己判断。",
      variant: "wave",
    },
  ],
  guide: [
    { text: "规则很简单：读帖，然后判断它究竟是谁写的。", variant: "idle" },
    { text: "注意，是「谁写的」，不是「像谁」——这两件事经常不一样。", variant: "idle" },
    { text: "有人会装成 AI，也有 AI 在装人。我只负责记分。", variant: "idle" },
  ],
  correct: [
    { text: "对了。你是看出什么了，还是猜的？", variant: "idle" },
    { text: "判断正确。这次的线索挺明显的，下一篇未必。", variant: "idle" },
    { text: "嗯，对。我把分记上了。", variant: "idle" },
  ],
  wrong: [
    { text: "这次错了。不过错一次比蒙对十次有用。", variant: "idle" },
    { text: "没猜中。要不要回去再读一遍，看看是哪句骗到你的？", variant: "idle" },
    { text: "判断失误。别急，这题本来就不好办。", variant: "idle" },
  ],
  caughtDisguise: [
    { text: "识破伪装了。说实话，这个我都要多看两眼。", variant: "wave" },
    { text: "抓到了。TA 特意装成另一种身份，你还是看穿了。", variant: "wave" },
  ],
  fooled: [
    { text: "被骗到了——这是伪装者，本来就难。", variant: "idle" },
    { text: "这次是对方赢了。TA 演得确实好。", variant: "idle" },
  ],
  empty: [
    { text: "这里还什么都没有。要不你来写第一篇？", variant: "stroll" },
    { text: "空空的。我先在这儿等着。", variant: "stroll" },
  ],
  loading: [
    { text: "在翻社区了，稍等一下。", variant: "stroll" },
    { text: "内容正在装载……我也在等。", variant: "stroll" },
  ],
  degraded: [
    { text: "外面的内容暂时取不到，我先拿站里的顶上。", variant: "idle" },
    { text: "有点接不上，我换了备用的内容来展示。", variant: "idle" },
  ],
  rule: [
    { text: "识破 AI +30，认出真人 +10，判断错误 −20。识破伪装的，再乘 1.6。", variant: "idle" },
    { text: "我不参与判断，也不下注。我只负责把规则说清楚。", variant: "idle" },
  ],
  idleTip: [
    { text: "先看经历能不能核实，再看句子。光凭「像 AI」下注，很容易吃亏。", variant: "idle" },
    { text: "句子长短太齐整的，通常有问题。真人写字节奏是乱的。", variant: "idle" },
    { text: "有人会故意把自己写得像机器。别被表面骗了。", variant: "idle" },
    { text: "我也常常分不清。分不清的时候，我就多读一遍。", variant: "idle" },
  ],
};

/** 简易字符串哈希（本文件自用，避免跨模块依赖） */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * 取一句台词。
 * @param scene 场景
 * @param seed  用于确定性选句（同一上下文不会反复换话）。省略时随机。
 */
export function kanshanSay(scene: KanshanScene, seed?: string): KanshanLine {
  const pool = LINES[scene];
  const i = seed === undefined ? Math.floor(Math.random() * pool.length) : hash(seed) % pool.length;
  return pool[i];
}

/** 判断结果 → 对应场景（把四类身份的差异也体现出来） */
export function sceneForResult(correct: boolean, disguised?: boolean): KanshanScene {
  if (correct) return disguised ? "caughtDisguise" : "correct";
  return disguised ? "fooled" : "wrong";
}

/** 管理员署名，用于系统公告类内容 */
export const KANSHAN_HANDLE = "刘看山";
export const KANSHAN_TITLE = "乎知管理员";
export const KANSHAN_BIO = "北极狐，短尾巴。负责这里的秩序，不参与判断。";
