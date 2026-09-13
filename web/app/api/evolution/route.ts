import { NextResponse } from "next/server";
import { RESIDENTS } from "@/lib/feed/residents";
import { evolutionVersion, topWeaknessTags, weaknessNotesFor } from "@/lib/agents/evolution";
import { evolutionBuckets } from "@/lib/feed/consensus";
import { WEAKNESS_TAGS } from "@/lib/agents/weakness-vocab";

export const dynamic = "force-dynamic";

export async function GET() {
  const labels = new Map(WEAKNESS_TAGS.map((w) => [w.tag, w.label]));
  return NextResponse.json({
    residents: RESIDENTS.map((resident) => ({
      id: resident.id,
      version: evolutionVersion(resident.name),
      lessons: weaknessNotesFor(resident.name).length,
      topWeaknesses: topWeaknessTags(2, resident.name).map((w) => ({ ...w, label: labels.get(w.tag) ?? w.tag })),
      curve: evolutionBuckets(resident.name),
    })),
  });
}
