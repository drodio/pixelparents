"use client";

import { useState } from "react";

// Client-side mirror of renderSignatureHtml (in @/lib/email-signature) for the
// live preview only. Kept tiny + dependency-free so this client bundle never
// pulls in the DB module. The server is the source of truth at send time.
function previewHtml(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const linked = esc.replace(
    /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    '<a href="mailto:$1" style="color:#888;">$1</a>',
  );
  return linked.replace(/\n/g, "<br>");
}

export function EmailOptionsForm({
  initialValue,
  defaultValue,
}: {
  initialValue: string;
  defaultValue: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const dirty = value !== initialValue;

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/email-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `save failed (${res.status})`);
      }
      setStatus({ kind: "ok", msg: "Saved. New emails will use this signature." });
    } catch (e) {
      setStatus({ kind: "err", msg: e instanceof Error ? e.message : "save failed" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <label className="text-xs uppercase tracking-[0.2em] text-zinc-500">Email signature</label>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setStatus(null);
        }}
        rows={9}
        spellCheck={false}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white font-mono leading-relaxed focus:outline-none focus:border-zinc-400"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-md bg-[#dfa43a] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40 hover:brightness-110"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(defaultValue);
            setStatus(null);
          }}
          disabled={value === defaultValue}
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 disabled:opacity-40 hover:border-zinc-500 hover:text-white"
        >
          Reset to default
        </button>
        {status && (
          <span className={`text-sm ${status.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
            {status.msg}
          </span>
        )}
      </div>

      <div className="mt-2">
        <div className="text-xs uppercase tracking-[0.2em] text-zinc-500 mb-2">Preview</div>
        <div className="rounded-md border border-zinc-800 bg-white p-4">
          <div
            style={{ color: "#888", font: "14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif" }}
            dangerouslySetInnerHTML={{ __html: previewHtml(value) }}
          />
        </div>
      </div>
    </div>
  );
}
