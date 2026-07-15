"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type KbDocument = {
  id: string;
  title: string;
  source_type: "pdf" | "url" | "text";
  source: string | null;
  status: "processing" | "ready" | "error";
  chunk_count: number;
  created_at: string;
};

const typeIcons = { pdf: "📄", url: "🌐", text: "📝" };

export default function KnowledgePage() {
  const supabase = useRef(supabaseBrowser()).current;
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [tab, setTab] = useState<"pdf" | "url" | "text">("pdf");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [url, setUrl] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textBody, setTextBody] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("kb_documents")
      .select("*")
      .order("created_at", { ascending: false });
    setDocs((data as KbDocument[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleResponse(res: Response, successMsg: string) {
    const body = await res.json().catch(() => null);
    if (res.ok) {
      setNotice(`${successMsg} (${body.chunkCount} passages indexed)`);
      load();
      return true;
    }
    setError(typeof body?.error === "string" ? body.error : `Failed (${res.status})`);
    return false;
  }

  async function uploadPdf() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/kb/upload", { method: "POST", body: form });
    if (await handleResponse(res, `"${file.name}" added`)) {
      if (fileRef.current) fileRef.current.value = "";
    }
    setBusy(false);
  }

  async function addUrl() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/kb/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    });
    if (await handleResponse(res, "Page added")) setUrl("");
    setBusy(false);
  }

  async function addText() {
    if (!textTitle.trim() || textBody.trim().length < 20) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/kb/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: textTitle.trim(), text: textBody.trim() }),
    });
    if (await handleResponse(res, `"${textTitle.trim()}" added`)) {
      setTextTitle("");
      setTextBody("");
    }
    setBusy(false);
  }

  async function remove(id: string) {
    await supabase.from("kb_documents").delete().eq("id", id); // chunks cascade
    load();
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">📚 Knowledge Base</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Upload your business documents — the AI answers customer questions
          from this content (RAG). Supported: PDF files, website pages, pasted
          text.
        </p>
      </div>

      {/* Add content */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">
        <div className="flex gap-1 text-sm">
          {(["pdf", "url", "text"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg ${
                tab === t
                  ? "bg-zinc-800 text-zinc-100 font-medium"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {typeIcons[t]} {t === "pdf" ? "PDF" : t === "url" ? "Website" : "Text"}
            </button>
          ))}
        </div>

        {tab === "pdf" && (
          <div className="flex gap-2 items-center">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="flex-1 text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:text-zinc-200 file:px-3 file:py-2 file:text-sm"
            />
            <button
              onClick={uploadPdf}
              disabled={busy}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold"
            >
              {busy ? "Indexing…" : "Upload"}
            </button>
          </div>
        )}

        {tab === "url" && (
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addUrl()}
              placeholder="https://yourwebsite.com/faq"
              className="flex-1 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={addUrl}
              disabled={busy || !url.trim()}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold"
            >
              {busy ? "Indexing…" : "Add page"}
            </button>
          </div>
        )}

        {tab === "text" && (
          <div className="space-y-2">
            <input
              value={textTitle}
              onChange={(e) => setTextTitle(e.target.value)}
              placeholder="Title (e.g. Return Policy)"
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
            />
            <textarea
              value={textBody}
              onChange={(e) => setTextBody(e.target.value)}
              rows={5}
              placeholder="Paste FAQs, policies, product info…"
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={addText}
              disabled={busy || !textTitle.trim() || textBody.trim().length < 20}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold"
            >
              {busy ? "Indexing…" : "Add text"}
            </button>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
        {notice && <p className="text-sm text-emerald-400">{notice}</p>}
      </div>

      {/* Document list */}
      <div className="space-y-2">
        {docs.map((d) => (
          <div
            key={d.id}
            className="rounded-xl border border-zinc-800 p-4 flex items-center gap-3"
          >
            <span className="text-lg">{typeIcons[d.source_type]}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{d.title}</p>
              <p className="text-xs text-zinc-500 truncate">
                {d.source ?? "pasted text"} · {d.chunk_count} passages ·{" "}
                {new Date(d.created_at).toLocaleDateString()}
              </p>
            </div>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                d.status === "ready"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : d.status === "error"
                    ? "bg-red-500/15 text-red-400"
                    : "bg-amber-500/15 text-amber-400"
              }`}
            >
              {d.status}
            </span>
            <button
              onClick={() => remove(d.id)}
              className="text-xs text-red-400/70 hover:text-red-400"
            >
              Delete
            </button>
          </div>
        ))}
        {docs.length === 0 && (
          <p className="text-sm text-zinc-500">
            No documents yet — the AI currently answers from conversation
            context only.
          </p>
        )}
      </div>
    </div>
  );
}
