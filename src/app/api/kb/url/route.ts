import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import dns from "node:dns/promises";
import net from "node:net";
import * as cheerio from "cheerio";
import { getOrgForCurrentUser } from "@/lib/org";
import { ingestDocument } from "@/lib/kb";
import { checkKbIngestion } from "@/lib/limits";

export const maxDuration = 120;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB cap on fetched page
const MAX_REDIRECTS = 3;
const ALLOWED_CONTENT_TYPES = ["text/html", "text/plain", "application/xhtml+xml"];

const bodySchema = z.object({
  url: z.string().url(),
});

// ---------- SSRF protection ----------
// Block requests that resolve to private, loopback, link-local, or otherwise
// reserved addresses (e.g. cloud metadata at 169.254.169.254).

function isBlockedIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true; // this-net, private, loopback
  if (a === 169 && b === 254) return true; // link-local (incl. metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast (224/4) + reserved (240/4)
  return false;
}

function isBlockedIp(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) return isBlockedIPv4(ip);
  if (fam === 6) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isBlockedIPv4(mapped[1]); // IPv4-mapped IPv6
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    const first = parseInt(lower.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    return false;
  }
  return true; // not a valid IP literal → block
}

async function assertSafeUrl(raw: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  if (!u.hostname) throw new Error("Invalid host");

  const allowedHosts = (process.env.KB_INGEST_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (allowedHosts.length > 0 && !allowedHosts.includes(u.hostname.toLowerCase())) {
    throw new Error("Host is not allowed for website ingestion");
  }

  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(u.hostname, { all: true });
  } catch {
    throw new Error("Could not resolve host");
  }
  if (addrs.length === 0) throw new Error("Could not resolve host");
  for (const { address } of addrs) {
    if (isBlockedIp(address)) {
      throw new Error("Blocked host (private or reserved address)");
    }
  }
}

// Fetch with manual redirect handling — every hop is re-validated against the
// SSRF blocklist so a public URL can't redirect to an internal one.
async function safeFetch(startUrl: string): Promise<Response> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeUrl(current);
    const res = await fetch(current, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KB-Ingest/1.0)" },
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

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

  let html: string;
  let sourceUrl = url;
  try {
    const res = await safeFetch(url);
    sourceUrl = res.url || url;
    if (!res.ok) {
      return NextResponse.json(
        { error: `Could not fetch page (HTTP ${res.status})` },
        { status: 422 }
      );
    }

    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (contentType && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: `Unsupported content type (${contentType})` },
        { status: 415 }
      );
    }

    // Enforce a size cap even when Content-Length is absent/misleading.
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared && declared > MAX_BYTES) {
      return NextResponse.json({ error: "Page too large" }, { status: 413 });
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Page too large" }, { status: 413 });
    }
    html = new TextDecoder("utf-8").decode(buf);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "URL ingestion failed" },
      { status: 422 }
    );
  }

  try {
    const $ = cheerio.load(html);
    $("script, style, nav, footer, header, noscript, iframe, svg").remove();
    const title = $("title").first().text().trim() || url;
    const main = $("main, article, [role=main]").first();
    const text = (main.length ? main.text() : $("body").text())
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n\s*/g, "\n\n")
      .trim();

    const limit = await checkKbIngestion(org, text.length);
    if (!limit.ok) {
      return NextResponse.json(limit, { status: 403 });
    }

    const result = await ingestDocument({
      orgId: org.id,
      title,
      sourceType: "url",
      source: sourceUrl,
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
