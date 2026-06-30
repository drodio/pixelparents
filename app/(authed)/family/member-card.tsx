"use client";

import { useCallback, useState } from "react";
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
import { patchFamilyMember } from "./actions";

const labelCls = "block text-sm font-medium text-white/80";
const inputCls =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40";

// One family member's editable profile card. Used for the caller's own profile
// AND for each other parent in the family — the SAME secure path either way:
// every save routes through patchFamilyMember, which re-derives the caller from
// the session and scopes the write to the caller's family (member ids are never
// trusted as authorization on their own). Email is the identity key, so it's
// shown read-only.
export function MemberCard({
  member,
  isSelf,
  isStudent,
  suggestedInterests,
}: {
  member: SignupRow;
  isSelf: boolean;
  // Whether this member's own login email is an OHS student email (computed
  // server-side in the page — lib/verify.ts imports node:crypto and must stay off
  // the client bundle).
  isStudent: boolean;
  suggestedInterests: string[];
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
          {/* Email is the identity key (login + directory mapping) — read-only. */}
          <input
            value={member.email}
            readOnly
            disabled
            className={`${inputCls} cursor-not-allowed text-white/50`}
          />
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
