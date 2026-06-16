"use client";

import { useState } from "react";

type Issued = {
  api_key: string;
  prefix: string;
  tier: string;
  note: string;
};

export function KeyConsole() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [intendedUse, setIntendedUse] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/developers/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, intended_use: intendedUse }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data?.issues
            ? "Please check the fields and try again."
            : (data?.message ?? "Something went wrong. Try again shortly."),
        );
        return;
      }
      setIssued(data as Issued);
    } catch {
      setError("Network error. Try again shortly.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyKey() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.api_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable; the key is visible to copy manually
    }
  }

  if (issued) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-5">
        <p className="font-semibold text-emerald-300">Your API key is ready 🎉</p>
        <p className="text-sm text-white/70">{issued.note}</p>
        <div className="flex items-center gap-3">
          <code className="flex-1 overflow-x-auto rounded-md border border-white/10 bg-black/60 px-3 py-2 font-mono text-xs text-white/90">
            {issued.api_key}
          </code>
          <button
            type="button"
            onClick={copyKey}
            className="shrink-0 rounded-md border border-white/20 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-white/50">
          Tier: <span className="font-mono text-white/70">{issued.tier}</span> — works on the public
          endpoints now. Want the richer endpoints? We review requests and upgrade keys manually.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-white/70">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            className="rounded-md border border-white/15 bg-black/40 px-3 py-2 text-white outline-none focus:border-emerald-400/60"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-white/70">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={200}
            className="rounded-md border border-white/15 bg-black/40 px-3 py-2 text-white outline-none focus:border-emerald-400/60"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-white/70">What are you building?</span>
        <textarea
          value={intendedUse}
          onChange={(e) => setIntendedUse(e.target.value)}
          required
          maxLength={2000}
          rows={3}
          className="rounded-md border border-white/15 bg-black/40 px-3 py-2 text-white outline-none focus:border-emerald-400/60"
        />
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-60"
      >
        {submitting ? "Generating…" : "Get a free API key"}
      </button>
      <p className="text-xs text-white/40">
        Instant, no approval needed. We only ever return counts and taxonomies — never names, emails,
        phones, children, or photos.
      </p>
    </form>
  );
}
