import { NextResponse } from "next/server";
import { getHotTopics } from "@/lib/zhihu/hot";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getHotTopics(12);
  return NextResponse.json(result);
}
