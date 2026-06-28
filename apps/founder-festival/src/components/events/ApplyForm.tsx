"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Mirrors the shape returned by /api/eval (see EvalResult in
// src/lib/eval-pipeline.ts). We only consume `evaluationId` + `status`;
// the rest of the payload is rendered later on /welcome or
// /not-this-round, so we don't need it here.
type EvalResult = {
  evaluationId: string;
  status: "scored" | "low-signal";
};

export function ApplyForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [stage, setStage] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "scoring" | "binding">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      setPhase("scoring");
      const evalRes = await fetch("/api/eval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ linkedinUrl }),
      });
      if (!evalRes.ok) {
        const eb = (await evalRes.json()) as { error?: string };
        throw new Error(eb.error ?? `HTTP ${evalRes.status}`);
      }
      const ev = (await evalRes.json()) as EvalResult;

      setPhase("binding");
      const applyRes = await fetch(`/api/events/${slug}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          evaluationId: ev.evaluationId,
          email,
          fullName: fullName || undefined,
          needs: stage ? { stage } : undefined,
          inviteCode: inviteCode || undefined,
        }),
      });
      if (!applyRes.ok) {
        const ab = (await applyRes.json()) as { error?: string };
        throw new Error(ab.error ?? `HTTP ${applyRes.status}`);
      }

      // Low-signal → /not-this-round so we don't show a 0 score on /welcome.
      // Everyone else lands on /welcome with the applied banner.
      const target =
        ev.status === "low-signal"
          ? `/not-this-round?e=${ev.evaluationId}&applied=${slug}`
          : `/welcome?e=${ev.evaluationId}&applied=${slug}`;
      router.push(target);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
      setBusy(false);
      setPhase("idle");
    }
  }

  if (busy && phase === "scoring") {
    return (
      <div className="w-full max-w-md flex flex-col items-center gap-3 text-zinc-300">
        <p>Scoring your profile…</p>
        <p className="text-xs text-zinc-500">This takes about 10–20 seconds.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 w-full max-w-md">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">LinkedIn URL</span>
        <input
          type="url"
          required
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          placeholder="https://www.linkedin.com/in/your-handle"
          className="rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-white"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-white"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">Full name (optional)</span>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-white"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">Where are you in your journey?</span>
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-white"
        >
          <option value="">Prefer not to say</option>
          <option value="pre-idea">Pre-idea</option>
          <option value="pre-seed">Pre-seed</option>
          <option value="seed">Seed</option>
          <option value="series-a">Series A</option>
          <option value="series-b">Series B+</option>
          <option value="post-exit">Post-exit</option>
          <option value="investor">I&apos;m an investor</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">Invite code (optional)</span>
        <input
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          className="rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-white"
        />
      </label>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-[#dfa43a] text-black font-medium px-6 py-3 hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}
