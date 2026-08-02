"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type KbDocument = {
  id: string;
  title: string;
  source_type: "pdf" | "docx" | "url" | "text";
  source: string | null;
  status: "processing" | "ready" | "error";
  chunk_count: number;
  created_at: string;
};

const typeLabels = { pdf: "PDF", docx: "DOCX", url: "URL", text: "TXT" };

export default function KnowledgePage() {
  const [supabase] = useState(() => supabaseBrowser());
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
    void Promise.resolve().then(load);
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

  async function uploadFile() {
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
    <div className="app-page-narrow space-y-6">
      <div>
        <h1 className="page-title">Knowledge Base</h1>
        <p className="page-copy">
          Upload your business documents — the AI answers customer questions
          from this content (RAG). Supported: PDF and Word (.docx) files up to
          20 MB, website pages, and pasted text.
        </p>
      </div>

      {/* Add content */}
      <div className="app-panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-1 text-sm">
          {(["pdf", "url", "text"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 font-medium ${
                tab === t
                  ? "bg-teal-700 text-white"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              {t === "pdf" ? "PDF / Word" : t === "url" ? "Website" : "Text"}
            </button>
          ))}
        </div>

        {tab === "pdf" && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="field flex-1 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
            />
            <button onClick={uploadFile} disabled={busy} className="btn-primary">
              {busy ? "Indexing…" : "Upload"}
            </button>
          </div>
        )}

        {tab === "url" && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addUrl()}
              placeholder="https://yourwebsite.com/faq"
              className="field flex-1"
            />
            <button
              onClick={addUrl}
              disabled={busy || !url.trim()}
              className="btn-primary"
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
              className="field"
            />
            <textarea
              value={textBody}
              onChange={(e) => setTextBody(e.target.value)}
              rows={5}
              placeholder="Paste FAQs, policies, product info…"
              className="field"
            />
            <button
              onClick={addText}
              disabled={busy || !textTitle.trim() || textBody.trim().length < 20}
              className="btn-primary"
            >
              {busy ? "Indexing…" : "Add text"}
            </button>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-teal-700">{notice}</p>}
      </div>

      {/* Document list */}
      <div className="space-y-2">
        {docs.map((d) => (
          <div
            key={d.id}
            className="app-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-600">
              {typeLabels[d.source_type]}
            </span>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{d.title}</p>
              <p className="truncate text-xs text-slate-500">
                {d.source ?? "pasted text"} · {d.chunk_count} passages ·{" "}
                {new Date(d.created_at).toLocaleDateString()}
              </p>
            </div>
            <span
              className={`badge ${
                d.status === "ready"
                  ? "bg-teal-50 text-teal-700"
                  : d.status === "error"
                    ? "bg-red-50 text-red-700"
                    : "bg-amber-50 text-amber-800"
              }`}
            >
              {d.status}
            </span>
            <button
              onClick={() => remove(d.id)}
              className="btn-ghost text-red-600 hover:text-red-700"
            >
              Delete
            </button>
          </div>
        ))}
        {docs.length === 0 && (
          <p className="text-sm text-slate-500">
            No documents yet — the AI currently answers from conversation
            context only.
          </p>
        )}
      </div>
    </div>
  );
}
