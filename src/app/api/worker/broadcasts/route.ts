import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { processQueuedBroadcasts } from "@/lib/broadcasts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  limit: z.number().int().min(1).max(25).optional(),
});

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await processQueuedBroadcasts({ limit: parsed.data.limit });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Broadcast worker failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Broadcast worker failed" },
      { status: 500 }
    );
  }
}
