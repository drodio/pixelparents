"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConflictProfile } from "@/lib/pending-items";
import { conflictVerdict } from "@/lib/conflict-verdict";
import { ExternalLinkIcon } from "@/components/ExternalLinkIcon";

// One "profile conflict": a verified email that maps to ≥2 evaluations. Shows the
// profiles (sorted strongest-first) with clickable LinkedIn links to inspect, an
// auto verdict (same person vs mis-linked strangers), and a per-profile Delete.
// (Merge lands in the next increment.)
function shortLinkedin(url: string | null): string {
  if (!url) return "";
  return url.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "").replace(/\/$/, "");
}

export function ProfileConflictCard({ email, profiles }: { email: string; profiles: ConflictProfile[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const verdict = conflictVerdict(profiles.map((p) => p.fullName));
  const verdictColor =
    verdict.kind === "different"
      ? "text-amber-300 border-amber-500/40 bg-amber-500/10"
      : verdict.kind === "same"
        ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10"
        : "text-zinc-300 border-zinc-600/50 bg-zinc-500/10";

  async function merge(winnerId: string, winnerName: string) {
    const losers = profiles.filter((p) => p.id !== winnerId);
    const warn = verdict.kind === "different" ? "\n\n⚠️ These look like DIFFERENT people — merging will fold a stranger's relationships into this profile. Delete the wrong one instead unless you're sure." : "";
    if (!window.confirm(`Merge ${losers.length} other profile(s) INTO "${winnerName}"? Their claims, email, attendance + photo credit move here; the others are deleted. Irreversible.${warn}`)) return;
    setBusyId(winnerId);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/profile/${winnerId}/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loserIds: losers.map((p) => p.id) }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({}));
        setErr(`Merge failed (${j.error ?? res.status})`);
      }
    } catch {
      setErr("Merge failed (network error)");
    } finally {
      setBusyId(null);
    }
  }

  async function unlink(id: string, name: string) {
    if (!window.confirm(`Un-link ${email} from "${name}"? The profile stays; the email just stops mapping to it.`)) return;
    setBusyId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/profile/${id}/unlink-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({}));
        setErr(`Un-link failed (${j.error ?? res.status})`);
      }
    } catch {
      setErr("Un-link failed (network error)");
    } finally {
      setBusyId(null);
    }
  }

  async function del(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This removes the profile from the system. Irreversible.`)) return;
    setBusyId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/profile/${id}/delete`, { method: "POST" });
      if (res.ok) {
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({}));
        setErr(`Delete failed (${j.error ?? res.status})`);
      }
    } catch {
      setErr("Delete failed (network error)");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-black/30 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
        <span className="font-mono text-zinc-200">{email}</span>
        {" → "}
        <span className="font-bold text-red-500">{profiles.length}</span> profiles
        <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${verdictColor}`}>{verdict.label}</span>
      </div>
      {err && <div className="mb-2 text-xs text-red-400">{err}</div>}
      <ul className="flex flex-col gap-2">
        {profiles.map((p, i) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <a href={`/profile?e=${p.id}`} target="_blank" rel="noopener noreferrer" className="link font-medium">
              {p.fullName ?? p.slug ?? "(no name)"}
            </a>
            {p.linkedinUrl ? (
              <a
                href={p.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 underline decoration-zinc-700 hover:text-zinc-200"
              >
                {shortLinkedin(p.linkedinUrl)} <ExternalLinkIcon className="ml-0.5" />
              </a>
            ) : (
              <span className="text-zinc-600">no linkedin</span>
            )}
            <span className={`text-xs uppercase tracking-wide ${p.signalQuality === "low" ? "text-red-400" : "text-emerald-400"}`}>
              {p.signalQuality}
            </span>
            <span className="text-xs text-zinc-400">
              F{p.founderScore}/I{p.investorScore}
            </span>
            {i === 0 && profiles.length > 1 && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">strongest</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => unlink(p.id, p.fullName ?? p.slug ?? "this profile")}
                className="rounded border border-zinc-600/60 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-700/40 disabled:opacity-50"
              >
                {busyId === p.id ? "…" : "Un-link email"}
              </button>
              {profiles.length > 1 && (
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => merge(p.id, p.fullName ?? p.slug ?? "this profile")}
                  className="rounded border border-emerald-500/40 px-2 py-0.5 text-xs text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                >
                  {busyId === p.id ? "…" : "Merge all into this"}
                </button>
              )}
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => del(p.id, p.fullName ?? p.slug ?? "this profile")}
                className="rounded border border-red-500/40 px-2 py-0.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50"
              >
                {busyId === p.id ? "…" : "Delete profile"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
