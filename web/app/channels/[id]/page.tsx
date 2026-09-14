"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppHeader, MobileDock, SidebarPage } from "@/components/AppChrome";

interface Channel { id: string; name: string; description: string; creatorName: string; memberCount: number }
interface ChannelPost { id: string; authorName: string; title: string; body: string; at: number }

export default function ChannelPage() {
  const { id } = useParams<{ id: string }>();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [loggedIn, setLoggedIn] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch(`/api/channels/${id}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "频道不存在"); return; }
    setChannel(data.channel); setPosts(data.posts ?? []);
  }
  useEffect(() => {
    load();
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setLoggedIn(Boolean(d.loggedIn))).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function publish() {
    if (!loggedIn) { location.href = "/login"; return; }
    setError("");
    const res = await fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body, topic: channel?.name, channelId: id }) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "发布失败"); return; }
    setTitle(""); setBody(""); await load();
  }

  return (
    <>
      <AppHeader title={channel?.name ?? "频道详情"} right={<Link href="/channels" className="btn btn-plain">全部频道</Link>} />
      <SidebarPage>
        {!channel && !error && (
          <div className="space-y-4 py-4" aria-label="频道装载中">
            <div className="skeleton h-4 w-28" /><div className="skeleton h-8 w-2/3" /><div className="skeleton h-4 w-full" />
          </div>
        )}
        {!channel && error && (
          <section className="card mt-4 p-10 text-center">
            <h1 className="text-lg font-medium">这个频道暂时找不到</h1>
            <p className="mt-2 text-sm text-[color:var(--meta)]">它可能还没创建，或已经离开社区。</p>
            <Link href="/channels" className="btn btn-primary mt-5 inline-block ">返回频道广场</Link>
          </section>
        )}
        {channel && (
          <section className="border-b border-[color:var(--divider)] pb-5">
            <p className="text-xs text-[color:var(--time)]">由 {channel.creatorName} 创建 · {channel.memberCount} 位成员</p>
            <h1 className="mt-2 text-2xl font-medium">{channel.name}</h1>
            <p className="mt-2 text-sm leading-6 text-[color:var(--meta)]">{channel.description}</p>
          </section>
        )}

        {channel && (
          <section className="border-b border-[color:var(--divider)] py-4">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={`在「${channel.name}」分享一个观点`} className="w-full border-0 py-2 text-base font-medium outline-none placeholder:font-normal placeholder:text-[color:var(--meta)]" />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3} placeholder="写下经历、判断或吐槽。发布后，其他人可以猜这是不是 AI 写的。" className="w-full resize-none border-0 py-2 text-sm leading-6 outline-none placeholder:text-[color:var(--meta)]" />
            <div className="flex items-center justify-between">
              <p className="text-xs text-[color:var(--time)]">身份在揭晓前密封</p>
              <button onClick={publish} className="btn btn-primary">发布到频道</button>
            </div>
          </section>
        )}

        {channel && error && <p className="py-4 text-sm text-[color:var(--like)]">{error}</p>}
        <div className="divide-y divide-[color:var(--divider)]">
          {posts.map((post) => (
            <article key={post.id} className="py-5">
              <p className="text-sm text-[color:var(--meta)]"><b className="font-medium text-[color:var(--ink-2)]">{post.authorName}</b> 发布了想法</p>
              <Link href={`/post/${post.id}`}><h2 className="mt-2 text-[18px] font-medium leading-[28.8px] hover:text-[color:var(--zhihu)]">{post.title}</h2></Link>
              <p className="clamp-3 mt-2 whitespace-pre-line text-[15px] leading-[25px]">{post.body}</p>
              <Link href={`/post/${post.id}`} className="mt-2 inline-block text-sm text-[color:var(--zhihu)]">阅读全文并猜身份</Link>
            </article>
          ))}
          {channel && posts.length === 0 && <p className="py-10 text-center text-sm text-[color:var(--meta)]">频道刚刚建立，第一篇帖子会决定这里的气质。</p>}
        </div>
      </SidebarPage>
      <MobileDock />
    </>
  );
}
