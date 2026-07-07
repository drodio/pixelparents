"use client";

import Link from "next/link";
import { useCallback, useRef, useState, useTransition } from "react";
import {
  OHS_AFFILIATIONS,
  US_STATES,
  COUNTRIES,
} from "@/lib/options";
import type { SignupRow } from "@/lib/db/schema/signups";
import { useAutoSave } from "@/lib/use-auto-save";
import { SaveStatus } from "@/components/save-status";
import { TagPicker } from "@/app/signup/thanks/family-form";
import type { SignupPatch } from "@/app/signup/actions";
import { builderStatusOf } from "@/lib/builder";
import { SHARE_VISIBILITY, type ShareVisibility } from "@/lib/share";
import { IconCode, IconSparkles } from "@/components/icons";
import {
  patchFamilyMember,
  refreshBuilderStatus,
  setBuilderManual,
  setFamilyMemberVisibility,
} from "./actions";
import { EnrichmentPanel } from "./enrichment-panel";
import {
  websiteUrlOf,
  enrichmentOptInOf,
  type StoredEnrichment,
} from "@/lib/enrichment/profile";

// Per-member visibility control. UNLIKE components/visibility-control.tsx (which
// routes through the owner-only setShareVisibility paths), this calls the
// family-scoped setFamilyMemberVisibility, so ANY family member can change ANY
// member's visibility — the action re-derives the caller from the session and
// scopes the write to the caller's family. Tiers + styling mirror the shared
// control so the UI stays consistent. Optimistic + supersede-on-newer-click, so
// an in-flight Server-Action page refresh never freezes the toggle.
function FamilyVisibilityControl({
  memberId,
  initial,
}: {
  memberId: string;
  initial: ShareVisibility;
}) {
  const [v, setV] = useState<ShareVisibility>(initial);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const latest = useRef<ShareVisibility>(initial);

  function choose(next: ShareVisibility) {
    if (next === v) return;
    const prev = v;
    latest.current = next;
    setV(next); // optimistic
    setError(null);
    start(async () => {
      const r = await setFamilyMemberVisibility(memberId, next);
      if (latest.current !== next) return; // a newer click already took over
      if (r.ok && r.visibility) {
        setV(r.visibility);
      } else {
        setV(prev);
        setError("Couldn’t update — try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-white/35">
          Visibility
        </span>
        <div className="inline-flex rounded-full border border-white/15 bg-white/[0.04] p-0.5 text-xs">
          {SHARE_VISIBILITY.map((o) => {
            const active = o.value === v;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => choose(o.value)}
                aria-pressed={active}
                title={`Set to "${o.label}"`}
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  active ? "bg-amber-400 text-black" : "text-white/55 hover:text-white"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-white/40">
        {v === "private"
          ? "Hidden from everyone except your family."
          : "Visible to signed-in OHS families in the directory."}
      </p>
      {error && <p className="text-xs text-red-400" aria-live="polite">{error}</p>}
    </div>
  );
}

const labelCls = "block text-sm font-medium text-white/80";
const inputCls =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40";

// "Builder status" block. The GitHub username is edited in the field above; this
// block lets a family member (a) run a commit check against the Pixel Parents
// repo (auto-sets the Builder tag when commits are found) and (b) manually toggle
// the Builder tag. Both calls are family-scoped server actions. State is local +
// optimistic; the underlying truth lives in the member's `extra` jsonb.
function BuilderStatusBlock({
  memberId,
  initialExtra,
  hasGithub,
  githubUsername,
}: {
  memberId: string;
  initialExtra: Record<string, unknown>;
  hasGithub: boolean;
  // Current (possibly not-yet-saved) username from the field above. Passed to
  // refreshBuilderStatus so the check runs against what the user just typed,
  // not a stale DB value the debounced autosave hasn't persisted yet.
  githubUsername: string;
}) {
  const init = builderStatusOf(initialExtra);
  const [isBuilder, setIsBuilder] = useState(init.isBuilder);
  const [contributions, setContributions] = useState(init.contributions);
  const [manual, setManual] = useState(initialExtra.builderManual === true);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onCheck = useCallback(async () => {
    setChecking(true);
    setMsg(null);
    try {
      const r = await refreshBuilderStatus(memberId, githubUsername);
      if (r.ok && r.status) {
        setIsBuilder(r.status.isBuilder);
        setContributions(r.status.contributions);
        setMsg(
          r.status.contributions > 0
            ? `Found ${r.status.contributions} contribution${
                r.status.contributions === 1 ? "" : "s"
              }.`
            : "No contributions found yet.",
        );
      } else {
        setMsg("Couldn’t check right now — try again.");
      }
    } catch {
      setMsg("Couldn’t check right now — try again.");
    } finally {
      setChecking(false);
    }
  }, [memberId, githubUsername]);

  const onToggleManual = useCallback(
    async (next: boolean) => {
      // Optimistic; revert on failure.
      const prevManual = manual;
      const prevBuilder = isBuilder;
      setManual(next);
      setIsBuilder(next || contributions > 0);
      setMsg(null);
      try {
        const r = await setBuilderManual(memberId, next);
        if (r.ok && r.status) {
          setIsBuilder(r.status.isBuilder);
          setContributions(r.status.contributions);
        } else {
          setManual(prevManual);
          setIsBuilder(prevBuilder);
          setMsg("Couldn’t save — try again.");
        }
      } catch {
        setManual(prevManual);
        setIsBuilder(prevBuilder);
        setMsg("Couldn’t save — try again.");
      }
    },
    [manual, isBuilder, contributions, memberId],
  );

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconCode className="h-4 w-4 text-amber-400" strokeWidth={2} />
          <span className="text-sm font-medium text-white/80">Builder status</span>
          {isBuilder && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
              <IconSparkles className="h-3 w-3" />
              Builder
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onCheck}
          disabled={checking || !hasGithub}
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checking ? "Checking…" : "Check GitHub contributions"}
        </button>
      </div>

      <p className="mt-2 text-sm text-white/55">
        {contributions > 0
          ? `${contributions} contribution${
              contributions === 1 ? "" : "s"
            } to Pixel Parents.`
          : "No contributions counted yet."}
      </p>

      {!hasGithub && (
        <p className="mt-1 text-xs text-white/40">
          Add a GitHub username above to check contributions.
        </p>
      )}

      <label className="mt-3 flex items-center gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={manual}
          onChange={(e) => onToggleManual(e.target.checked)}
          className="h-4 w-4 accent-amber-500"
        />
        Mark as a Builder manually
      </label>

      {msg && <p className="mt-2 text-xs text-white/45" aria-live="polite">{msg}</p>}
    </div>
  );
}

// One family member's editable profile card. Used for the caller's own profile,
// for each co-parent/guardian, AND for student accounts — the SAME secure path
// either way: every save routes through patchFamilyMember, which re-derives the
// caller from the session and scopes the write to the caller's family (member ids
// are never trusted as authorization on their own). Email is the identity key, so
// it's shown read-only. The LinkedIn + GitHub username fields and the Builder
// status block render for ALL members (parents AND student accounts) — they're
// optional. A per-member visibility control (any family member can change any
// member's) and read-only student profile fields round out the card.
export function MemberCard({
  member,
  isSelf,
  isStudent,
  suggestedInterests,
  initialVisibility,
  studentProfile,
}: {
  member: SignupRow;
  isSelf: boolean;
  // Whether this member's own login email is an OHS student email (computed
  // server-side in the page — lib/verify.ts imports node:crypto and must stay off
  // the client bundle).
  isStudent: boolean;
  suggestedInterests: string[];
  // This member's current share visibility tier (already coerced server-side).
  initialVisibility: ShareVisibility;
  // When this is a STUDENT ACCOUNT that matched a `children` row by verified
  // student email, the dedup enriches the card with that child row's grade +
  // interests so we show ONE entry (the account) instead of two. Undefined for
  // parents/guardians and for student accounts with no matching child row.
  studentProfile?: { grade: string | null; interests: string[] };
}) {
  const save = useCallback(
    async (patch: SignupPatch) => {
      const r = await patchFamilyMember(member.id, patch);
      if (!r.ok) throw new Error("save failed");
    },
    [member.id],
  );
  const { queue, status } = useAutoSave<SignupPatch>(save);

  const [v, setV] = useState({
    firstName: member.firstName,
    lastName: member.lastName,
    phone: member.phone,
    githubUsername: member.githubUsername,
    linkedinHandle: (member.linkedinUrl ?? "").replace(
      /^https?:\/\/(www\.)?linkedin\.com\/in\//,
      "",
    ),
    websiteUrl: websiteUrlOf((member.extra ?? {}) as Record<string, unknown>) ?? "",
    ohsAffiliation: member.ohsAffiliation ?? "",
    city: member.city ?? "",
    state: member.state ?? "",
    country: member.country ?? "",
    parentInterests: member.parentInterests ?? [],
  });

  function set<K extends keyof typeof v>(key: K, value: (typeof v)[K], immediate = false) {
    setV((prev) => ({ ...prev, [key]: value }));
    queue({ [key]: value } as SignupPatch, immediate);
  }

  // State only applies to US families. Mirror the signup form: switching away
  // from the US clears any picked state in the same save so the row stays
  // consistent (the community map then plots by country centroid).
  function setCountry(value: string) {
    const clearState = value !== "United States";
    setV((prev) => ({ ...prev, country: value, ...(clearState ? { state: "" } : {}) }));
    queue({ country: value, ...(clearState ? { state: "" } : {}) }, true);
  }

  const displayName = `${v.firstName} ${v.lastName}`.trim() || member.email || "Family member";

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-amber-400">{displayName}</h3>
          {isSelf && (
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white/60">
              You
            </span>
          )}
          {isStudent && (
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
              Student
            </span>
          )}
        </div>
        <SaveStatus status={status} />
      </div>

      {/* Per-member visibility — any family member can change any member's. */}
      <FamilyVisibilityControl memberId={member.id} initial={initialVisibility} />

      {/* Student profile fields — grade + interests carried over from the matched
          child row when this student account was deduped against it. Read-only
          here: the grade/interests still live on (and are edited via) the child
          card in the Children section. */}
      {studentProfile && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className={labelCls}>Grade</span>
            <p className="mt-1 text-sm text-white/70">
              {studentProfile.grade?.trim() || "Not set"}
            </p>
          </div>
          <div>
            <span className={labelCls}>Student interests</span>
            <p className="mt-1 text-sm text-white/70">
              {studentProfile.interests.length > 0
                ? studentProfile.interests.join(", ")
                : "Not set"}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>First name</label>
          <input
            value={v.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Last name</label>
          <input
            value={v.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          {/* Email is the identity key (login + directory mapping) — read-only.
              It's ALSO where every Pixel Parents notification is sent, so a parent
              who signed up with the wrong address (e.g. their child's) would
              otherwise have no way to notice or fix it. Say so, and give a recovery
              path — a raw edit here is unsafe because changing the identity key
              without re-mapping the login would lock the account out. */}
          <input
            value={member.email}
            readOnly
            disabled
            className={`${inputCls} cursor-not-allowed text-white/50`}
          />
          <p className="mt-1 text-xs text-white/40">
            All Pixel Parents notifications are sent here, and it&apos;s tied to your
            login. Wrong address (e.g. you used your child&apos;s by mistake)?{" "}
            <Link
              href="/report"
              className="text-amber-400 underline decoration-amber-400/60 underline-offset-2 hover:text-amber-300"
            >
              Contact us to fix it
            </Link>
            .
          </p>
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input
            value={v.phone}
            onChange={(e) => set("phone", e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>GitHub username</label>
          <div className="mt-1 flex items-center rounded-lg border border-white/15 bg-white/5 focus-within:border-white/40">
            <span className="select-none px-3 py-2 text-sm text-white/40">github.com/</span>
            <input
              value={v.githubUsername}
              onChange={(e) => set("githubUsername", e.target.value)}
              className="w-full rounded-r-lg bg-transparent py-2 pr-3 text-white outline-none"
            />
          </div>
        </div>
        <div className="sm:col-span-2">
          <BuilderStatusBlock
            memberId={member.id}
            initialExtra={(member.extra ?? {}) as Record<string, unknown>}
            hasGithub={Boolean(v.githubUsername.trim())}
            githubUsername={v.githubUsername}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>LinkedIn</label>
          <div className="mt-1 flex items-center rounded-lg border border-white/15 bg-white/5 focus-within:border-white/40">
            <span className="select-none px-3 py-2 text-sm text-white/40">linkedin.com/in/</span>
            <input
              value={v.linkedinHandle}
              onChange={(e) => set("linkedinHandle", e.target.value)}
              className="w-full rounded-r-lg bg-transparent py-2 pr-3 text-white outline-none"
            />
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Personal website</label>
          <input
            type="url"
            inputMode="url"
            value={v.websiteUrl}
            onChange={(e) => set("websiteUrl", e.target.value)}
            placeholder="https://yourname.com"
            className={inputCls}
          />
        </div>
        {/* Owner-only auto-built profile: opt-in, status, refresh, edit, delete. */}
        <div className="sm:col-span-2">
          <EnrichmentPanel
            memberId={member.id}
            initialOptIn={enrichmentOptInOf((member.extra ?? {}) as Record<string, unknown>)}
            initialEnrichment={
              ((member.extra ?? {}) as Record<string, unknown>).enrichment as StoredEnrichment | null
            }
          />
        </div>
      </div>

      <fieldset>
        <legend className={labelCls}>OHS affiliation</legend>
        <div className="mt-2 flex flex-col gap-2">
          {OHS_AFFILIATIONS.map((opt) => (
            <label key={opt} className="flex items-start gap-2 text-sm text-white/80">
              <input
                type="radio"
                name={`ohsAffiliation-${member.id}`}
                checked={v.ohsAffiliation === opt}
                onChange={() => set("ohsAffiliation", opt, true)}
                className="mt-1 h-4 w-4 accent-amber-500"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Country</label>
          <select
            value={v.country}
            onChange={(e) => setCountry(e.target.value)}
            className={inputCls}
          >
            <option value="">Select…</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>City</label>
          <input
            value={v.city}
            onChange={(e) => set("city", e.target.value)}
            className={inputCls}
          />
        </div>
        {/* State applies to US families; everyone else plots by country centroid. */}
        {v.country === "United States" && (
          <div>
            <label className={labelCls}>State</label>
            <select
              value={v.state}
              onChange={(e) => set("state", e.target.value, true)}
              className={inputCls}
            >
              <option value="">Select…</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className={labelCls}>Interests</label>
        <TagPicker
          value={v.parentInterests}
          onChange={(next) => set("parentInterests", next, true)}
          suggestions={suggestedInterests}
          placeholder="Type an interest and press Enter"
        />
      </div>

      <p className="text-xs text-white/40">Changes save automatically.</p>
    </div>
  );
}
