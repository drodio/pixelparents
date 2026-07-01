"use client";

import { useCallback, useState, useTransition } from "react";
import { IconSparkles, IconCode } from "@/components/icons";
import {
  setEnrichmentOptIn,
  refreshEnrichment,
  saveEnrichmentOwnerEdit,
  deleteEnrichment,
} from "./actions";
import type { StoredEnrichment } from "@/lib/enrichment/profile";
import { curatedEnrichmentOf } from "@/lib/enrichment/profile";

// OWNER-ONLY enrichment panel, rendered inside a family MemberCard. Shows the
// member their auto-built profile in full: the curated info (bio/expertise/how-
// they-can-help, editable), the facts grouped by source, AND the data-source
// status roster (incl. "API key not set"). Lets them opt in/out, manually refresh
// (rate-limited server-side), edit the bio/expertise, and delete the enrichment.
//
// The raw facts + status roster shown here are NEVER shared — only the curated
// info can appear elsewhere, behind the default-OFF "profile_enrichment" share
// field (see lib/directory.ts / components/profile-view.tsx).

const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  no_api_key: "API key not set",
  no_data: "No data found",
  error: "Error",
};

const STATUS_CLASS: Record<string, string> = {
  ok: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  no_api_key: "border-white/15 bg-white/[0.04] text-white/45",
  no_data: "border-white/15 bg-white/[0.04] text-white/55",
  error: "border-red-400/30 bg-red-400/10 text-red-300",
};

function Chips({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t) => (
        <span
          key={t}
          className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/80"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

export function EnrichmentPanel({
  memberId,
  initialOptIn,
  initialEnrichment,
}: {
  memberId: string;
  initialOptIn: boolean;
  initialEnrichment: StoredEnrichment | null;
}) {
  const [optedIn, setOptedIn] = useState(initialOptIn);
  const [enr, setEnr] = useState<StoredEnrichment | null>(initialEnrichment);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);

  const curated = curatedEnrichmentOf(enr);
  const buildStatus = enr?.buildStatus;

  const [bio, setBio] = useState(curated?.bio ?? "");
  const [tags, setTags] = useState((curated?.expertiseTags ?? []).join(", "));
  const [help, setHelp] = useState((curated?.canHelpWith ?? []).join("\n"));

  const onToggle = useCallback(
    (next: boolean) => {
      const prev = optedIn;
      setOptedIn(next); // optimistic
      setMsg(next ? "Building your profile… (~1 min)" : null);
      start(async () => {
        const r = await setEnrichmentOptIn(memberId, next);
        if (!r.ok) {
          setOptedIn(prev);
          setMsg("Couldn’t save — try again.");
          return;
        }
        if (!next) {
          setMsg(null);
          return;
        }
        // The build now runs inline, so we have a real outcome — swap the
        // optimistic "Building…" for it (and adopt the fresh enrichment) instead
        // of leaving a message that never resolves.
        if (r.enrichment !== undefined) setEnr(r.enrichment);
        if (r.ran) setMsg("Profile built.");
        else if (r.reason === "no-inputs")
          setMsg("Add a LinkedIn, GitHub, or website above first.");
        else if (r.reason === "rate-limited" || r.reason === "in-flight")
          setMsg("Building your profile… (~1 min) — check back shortly.");
        else setMsg(null);
      });
    },
    [memberId, optedIn],
  );

  const onRefresh = useCallback(() => {
    setMsg("Refreshing your profile… (~1 min)");
    start(async () => {
      const r = await refreshEnrichment(memberId);
      if (!r.ok) {
        setMsg("Couldn’t refresh — try again.");
        return;
      }
      // Adopt the freshly-stored enrichment so the bio/expertise below actually
      // update — revalidatePath alone can't replace this client component's state.
      if (r.enrichment !== undefined) setEnr(r.enrichment);
      if (r.ran) setMsg("Profile refreshed.");
      else if (r.reason === "rate-limited") setMsg("Just refreshed — try again in a minute.");
      else if (r.reason === "no-inputs")
        setMsg("Add a LinkedIn, GitHub, or website above first.");
      else setMsg("Nothing to update right now.");
    });
  }, [memberId]);

  const onSaveEdit = useCallback(() => {
    start(async () => {
      const r = await saveEnrichmentOwnerEdit(memberId, {
        bio,
        expertiseTags: tags.split(",").map((s) => s.trim()).filter(Boolean),
        canHelpWith: help.split("\n").map((s) => s.trim()).filter(Boolean),
      });
      if (r.ok) {
        setEditing(false);
        setMsg("Saved your edits.");
        setEnr((prev) =>
          prev
            ? {
                ...prev,
                ownerEdit: {
                  bio,
                  expertiseTags: tags.split(",").map((s) => s.trim()).filter(Boolean),
                  canHelpWith: help.split("\n").map((s) => s.trim()).filter(Boolean),
                  editedByOwner: true,
                  editedAt: new Date().toISOString(),
                },
              }
            : prev,
        );
      } else {
        setMsg("Couldn’t save your edits — try again.");
      }
    });
  }, [memberId, bio, tags, help]);

  const onDelete = useCallback(() => {
    if (!confirm("Delete your auto-built profile? This can’t be undone.")) return;
    start(async () => {
      const r = await deleteEnrichment(memberId);
      if (r.ok) {
        setEnr(null);
        setMsg("Deleted your auto-built profile.");
      } else {
        setMsg("Couldn’t delete — try again.");
      }
    });
  }, [memberId]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconSparkles className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium text-white/80">Auto-built profile</span>
          {buildStatus === "building" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
              Building… ~1 min
            </span>
          )}
          {buildStatus === "ready" && curated && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
              Ready
            </span>
          )}
          {buildStatus === "error" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[11px] font-medium text-red-300">
              Last build failed
            </span>
          )}
        </div>
        {optedIn && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={pending}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Working…" : "Refresh profile data"}
          </button>
        )}
      </div>

      {/* Opt-in control — default OFF; clear consent copy. */}
      <label className="mt-3 flex items-start gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={optedIn}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={pending}
          className="mt-1 h-4 w-4 accent-amber-500"
        />
        <span>
          Build my profile automatically from public data (LinkedIn, GitHub,
          personal website, etc.).{" "}
          <em className="text-white/55">
            Public, you-provided sources only — never school systems. Only the
            curated bio &amp; expertise can be shared (and only if you enable the
            “AI-built profile” share field); the facts and source list below stay
            private to you.
          </em>
        </span>
      </label>

      {msg && <p className="mt-2 text-xs text-white/55" aria-live="polite">{msg}</p>}

      {!optedIn && (
        <p className="mt-2 text-xs text-white/40">
          Enrichment is off. Turn it on to build your profile from public data.
        </p>
      )}

      {optedIn && curated && (
        <div className="mt-4 flex flex-col gap-5">
          {/* Curated info (owner-editable). */}
          <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/40">
                Bio &amp; expertise{curated.editedByOwner ? " · edited by you" : ""}
              </span>
              {!editing ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-xs text-amber-400 hover:underline"
                >
                  Edit
                </button>
              ) : null}
            </div>

            {!editing ? (
              <>
                {curated.bio && <p className="text-sm text-white/80">{curated.bio}</p>}
                {curated.expertiseTags.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-white/35">
                      Expertise
                    </p>
                    <Chips items={curated.expertiseTags} />
                  </div>
                )}
                {curated.canHelpWith.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-white/35">
                      How they can help
                    </p>
                    <ul className="list-disc pl-5 text-sm text-white/75">
                      {curated.canHelpWith.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs text-white/55">Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/55">Expertise (comma-separated)</label>
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/55">How they can help (one per line)</label>
                  <textarea
                    value={help}
                    onChange={(e) => setHelp(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onSaveEdit}
                    disabled={pending}
                    className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-black hover:bg-amber-300 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Facts grouped by source — OWNER-ONLY. */}
          {enr && enr.factsBySource.length > 0 && (
            <details className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-white/40">
                What we found (by source)
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                {enr.factsBySource.map((g) => (
                  <div key={g.source}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300/80">
                      {g.source}
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-white/70">
                      {g.facts.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Data-source status roster — OWNER-ONLY. */}
          {enr && enr.statuses.length > 0 && (
            <details className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-white/40">
                Data sources ({enr.statuses.length})
              </summary>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {enr.statuses.map((s) => (
                  <span
                    key={s.source}
                    title={s.note ?? STATUS_LABEL[s.status] ?? s.status}
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${
                      STATUS_CLASS[s.status] ?? "border-white/15 text-white/55"
                    }`}
                  >
                    {s.source}: {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                ))}
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-white/40">
                <IconCode className="mt-0.5 h-3 w-3 shrink-0" />
                Paid data sources (e.g. BrightData, Crunchbase) aren’t enabled yet —
                those show “API key not set”.
              </p>
            </details>
          )}

          <div>
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className="text-xs text-red-300/80 hover:text-red-300 hover:underline disabled:opacity-50"
            >
              Delete my auto-built profile
            </button>
          </div>
        </div>
      )}

      {optedIn && !curated && buildStatus !== "building" && (
        <p className="mt-3 text-xs text-white/45">
          No profile built yet. Add a LinkedIn, GitHub, or website above, then use
          “Refresh profile data”.
        </p>
      )}
    </div>
  );
}
