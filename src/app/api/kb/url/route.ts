import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as cheerio from "cheerio";
import { getOrgForCurrentUser } from "@/lib/org";
import { ingestDocument } from "@/lib/kb";

export const maxDuration = 120;

const bodySchema = z.object({
  url: z.string().url().refine((u) => u.startsWith("http"), "http(s) URLs only"),
});

// Ingest a public web page into the knowledge base.
export async function POST(req: NextRequest) {
  const org = await getOrgForCurrentUser();
  if (!org) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  const { url } = parsed.data;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KB-Ingest/1.0)" },
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Could not fetch page (HTTP ${res.status})` },
        { status: 422 }
      );
    }
    const html = await res.text();

    const $ = cheerio.load(html);
    $("script, style, nav, footer, header, noscript, iframe, svg").remove();
    const title = $("title").first().text().trim() || url;
    const main = $("main, article, [role=main]").first();
    const text = (main.length ? main.text() : $("body").text())
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n\s*/g, "\n\n")
      .trim();

    const result = await ingestDocument({
      orgId: org.id,
      title,
      sourceType: "url",
      source: url,
      text,
    });
    return NextResponse.json({ ok: true, title, ...result });
  } catch (err) {
    console.error("URL ingestion failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "URL ingestion failed" },
      { status: 422 }
    );
  }
}
