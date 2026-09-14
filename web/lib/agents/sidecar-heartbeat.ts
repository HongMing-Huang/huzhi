// OASIS sidecar 心跳（push 模型）。
//
// 为什么是 push 而不是 Web 主动探测：探测意味着“环境变量里的 URL →
// 服务端出站请求”，是一整类 SSRF 面；而 sidecar 本来就知道乎知地址，
// 由它每 5 秒把自己的健康状态 POST 进来，Web 端零出站请求，只读
// 心跳是否新鲜。这是唯一能让“Web 端不发起任何内网探测请求”的模型。
//
// 心跳只影响状态展示与行为引擎主备切换，不参与积分/身份等业务。

/** 心跳 5s 一次；超过该窗口视为 sidecar 离线。 */
const FRESH_MS = 15_000;

interface Beat {
  at: number;
  payload: Record<string, unknown>;
}

const g = globalThis as unknown as { __huzhiSidecarBeat?: Beat };
const beat: Beat = (g.__huzhiSidecarBeat ??= { at: 0, payload: {} });

/** 记录一次 sidecar 心跳（仅保留标量字段，由调用方过滤）。 */
export function recordSidecarHeartbeat(payload: Record<string, unknown>): void {
  beat.at = Date.now();
  beat.payload = payload;
}

/** 心跳是否新鲜（sidecar 在线）。 */
export function sidecarHeartbeatFresh(): boolean {
  return beat.at > 0 && Date.now() - beat.at < FRESH_MS;
}

/**
 * sidecar 是否可以完全接管居民行为。
 * 必须「在线 且 自主模式开启」——否则会出现“sidecar 健康但没模型
 * 不行动、本地循环又被关掉”的双重停摆（审计 50 轮明确过的坑）。
 */
export function sidecarFullyAutonomous(): boolean {
  return sidecarHeartbeatFresh() && beat.payload.autonomy === true;
}

/** 面向展示的运行状态（/api/agents/runtime GET 用）。 */
export function sidecarStatus(): {
  connected: boolean;
  payload: Record<string, unknown>;
} {
  return {
    connected: sidecarHeartbeatFresh(),
    payload: sidecarHeartbeatFresh() ? beat.payload : {},
  };
}
