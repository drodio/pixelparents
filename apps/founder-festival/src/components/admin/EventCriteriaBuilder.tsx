"use client";
import { useState } from "react";

const STAGES = ["pre-seed", "seed", "series-a", "series-b", "series-c+", "growth", "public", "acquired"] as const;

type Draft = {
  slug: string;
  title: string;
  hostName: string;
  hostEmail: string;
  startsAt: string;
  endsAt: string;
  venue: string;
  capacity: string;
  approvalMode: "manual" | "auto" | "hybrid";
  description: string;
  side: "founder" | "investor" | "either";
  founderScoreMin: string;
  investorScoreMin: string;
  stages: string[];
};

export function NewEventForm() {
  const [s, setS] = useState<Draft>({
    slug: "", title: "", hostName: "", hostEmail: "", startsAt: "", endsAt: "",
    venue: "", capacity: "", approvalMode: "manual", description: "",
    side: "founder", founderScoreMin: "0", investorScoreMin: "0",
    stages: [...STAGES],
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleStage(stage: string) {
    setS((p) => ({ ...p, stages: p.stages.includes(stage) ? p.stages.filter((x) => x !== stage) : [...p.stages, stage] }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const body = {
        slug: s.slug, title: s.title,
        hostName: s.hostName || null, hostEmail: s.hostEmail || null,
        startsAt: new Date(s.startsAt).toISOString(),
        endsAt: s.endsAt ? new Date(s.endsAt).toISOString() : null,
        venue: s.venue || null, capacity: s.capacity ? parseInt(s.capacity, 10) : null,
        approvalMode: s.approvalMode, description: s.description || null,
        criteria: {
          side: s.side,
          founderScoreMin: parseInt(s.founderScoreMin || "0", 10),
          investorScoreMin: parseInt(s.investorScoreMin || "0", 10),
          stages: s.stages,
        },
      };
      const res = await fetch("/api/admin/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const b = (await res.json()) as { error?: string };
        throw new Error(b.error ?? "create failed");
      }
      const { id } = (await res.json()) as { id: string };
      window.location.href = `/admin/events/${id}`;
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
      setBusy(false);
    }
  }

  const input = "rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-white";
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-zinc-300">{label}</span>
      {children}
    </label>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 max-w-2xl">
      <Field label="Title"><input className={input} required value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} /></Field>
      <Field label="Slug"><input className={input + " font-mono"} required pattern="[a-z0-9-]+" value={s.slug} onChange={(e) => setS({ ...s, slug: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Host name"><input className={input} value={s.hostName} onChange={(e) => setS({ ...s, hostName: e.target.value })} /></Field>
        <Field label="Host email"><input type="email" className={input} value={s.hostEmail} onChange={(e) => setS({ ...s, hostEmail: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Starts at"><input type="datetime-local" className={input} required value={s.startsAt} onChange={(e) => setS({ ...s, startsAt: e.target.value })} /></Field>
        <Field label="Ends at (optional)"><input type="datetime-local" className={input} value={s.endsAt} onChange={(e) => setS({ ...s, endsAt: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Venue"><input className={input} value={s.venue} onChange={(e) => setS({ ...s, venue: e.target.value })} /></Field>
        <Field label="Capacity (blank = unlimited)"><input type="number" className={input} value={s.capacity} onChange={(e) => setS({ ...s, capacity: e.target.value })} /></Field>
      </div>
      <Field label="Description (public)"><textarea className={input + " min-h-32"} value={s.description} onChange={(e) => setS({ ...s, description: e.target.value })} /></Field>

      <fieldset className="flex flex-col gap-3 border border-zinc-800 rounded-md p-4 mt-2">
        <legend className="text-zinc-300 text-sm px-2">Approval & criteria</legend>
        <Field label="Approval mode">
          <select className={input} value={s.approvalMode} onChange={(e) => setS({ ...s, approvalMode: e.target.value as Draft["approvalMode"] })}>
            <option value="manual">Manual — every applicant reviewed by hand</option>
            <option value="hybrid">Hybrid — auto-approve obvious, queue near-misses</option>
            <option value="auto">Auto — auto-approve and auto-deny on criteria</option>
          </select>
        </Field>
        <Field label="Target side">
          <select className={input} value={s.side} onChange={(e) => setS({ ...s, side: e.target.value as Draft["side"] })}>
            <option value="founder">Founders only</option>
            <option value="investor">Investors only</option>
            <option value="either">Either</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Min founder score"><input type="number" className={input} value={s.founderScoreMin} onChange={(e) => setS({ ...s, founderScoreMin: e.target.value })} /></Field>
          <Field label="Min investor score"><input type="number" className={input} value={s.investorScoreMin} onChange={(e) => setS({ ...s, investorScoreMin: e.target.value })} /></Field>
        </div>
        <fieldset>
          <legend className="text-sm text-zinc-300 mb-2">Allowed stages</legend>
          <div className="flex flex-wrap gap-2">
            {STAGES.map((stage) => (
              <label key={stage} className="flex items-center gap-1.5 text-sm text-zinc-300 px-2 py-1 border border-zinc-700 rounded">
                <input type="checkbox" checked={s.stages.includes(stage)} onChange={() => toggleStage(stage)} />
                {stage}
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>

      {err && <p className="text-sm text-red-400">{err}</p>}
      <button type="submit" disabled={busy} className="rounded-md bg-white text-black font-medium px-6 py-3 hover:bg-zinc-200 disabled:opacity-50">
        {busy ? "Creating…" : "Create event"}
      </button>
    </form>
  );
}
