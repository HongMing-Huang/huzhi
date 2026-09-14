// Next.js 服务器实例启动时执行一次（先于任何请求）：
// 远端持久化模式下把全部集合预热进内存，保证 loadCollection 首次读取就是完整数据。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { preloadCollections, persistenceMode } = await import("./lib/db");
  await preloadCollections();
  console.log(`[huzhi] persistence mode: ${persistenceMode()}`);
}
