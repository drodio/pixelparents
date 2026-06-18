"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  OHS_AFFILIATIONS,
  TECHNICAL_DEPTH,
  SKILLSETS,
  TIME_COMMITMENT,
  US_STATES,
} from "@/lib/options";
import type { SignupRow } from "@/lib/db/schema/signups";
import { useAutoSave } from "@/lib/use-auto-save";
import { SaveStatus } from "@/components/save-status";
import { patchSignup, type SignupPatch } from "@/app/signup/actions";

const labelCls = "block text-sm font-medium text-white/80";
const inputCls =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40";

export default function EditForm({ row }: { row: SignupRow }) {
  const save = useCallback(
    async (patch: SignupPatch) => {
      const r = await patchSignup(row.id, patch);
      if (!r.ok) throw new Error("save failed");
    },
    [row.id],
  );
  const { queue, status } = useAutoSave<SignupPatch>(save);

  const [v, setV] = useState({
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    githubUsername: row.githubUsername,
    linkedinHandle: (row.linkedinUrl ?? "").replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, ""),
    ohsAffiliation: row.ohsAffiliation ?? "",
    technicalDepth: row.technicalDepth ?? "",
    timeCommitment: row.timeCommitment ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    skillsets: row.skillsets ?? [],
  });

  function set<K extends keyof typeof v>(key: K, value: (typeof v)[K], immediate = false) {
    setV((prev) => ({ ...prev, [key]: value }));
    queue({ [key]: value } as SignupPatch, immediate);
  }
  function toggleSkill(opt: string) {
    setV((prev) => {
      const next = prev.skillsets.includes(opt)
        ? prev.skillsets.filter((s) => s !== opt)
        : [...prev.skillsets, opt];
      queue({ skillsets: next }, true);
      return { ...prev, skillsets: next };
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link
          href={`/signup/thanks?id=${row.id}&admin=1`}
          className="text-sm font-medium text-amber-400 hover:underline"
        >
          Edit family + child(ren) details →
        </Link>
        <SaveStatus status={status} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>First name</label>
          <input value={v.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Last name</label>
          <input value={v.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input value={v.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input value={v.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
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
      </div>

      <fieldset>
        <legend className={labelCls}>OHS affiliation</legend>
        <div className="mt-2 flex flex-col gap-2">
          {OHS_AFFILIATIONS.map((opt) => (
            <label key={opt} className="flex items-start gap-2 text-sm text-white/80">
              <input type="radio" name="ohsAffiliation" checked={v.ohsAffiliation === opt} onChange={() => set("ohsAffiliation", opt, true)} className="mt-1 h-4 w-4 accent-amber-500" />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={labelCls}>Technical depth</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {TECHNICAL_DEPTH.map((opt) => (
            <label key={opt} className="flex items-start gap-2 text-sm text-white/80">
              <input type="radio" name="technicalDepth" checked={v.technicalDepth === opt} onChange={() => set("technicalDepth", opt, true)} className="mt-1 h-4 w-4 accent-amber-500" />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className={labelCls}>LinkedIn</label>
        <div className="mt-1 flex items-center rounded-lg border border-white/15 bg-white/5 focus-within:border-white/40">
          <span className="select-none px-3 py-2 text-sm text-white/40">linkedin.com/in/</span>
          <input value={v.linkedinHandle} onChange={(e) => set("linkedinHandle", e.target.value)} className="w-full rounded-r-lg bg-transparent py-2 pr-3 text-white outline-none" />
        </div>
      </div>

      <fieldset>
        <legend className={labelCls}>Skillsets</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SKILLSETS.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-white/80">
              <input type="checkbox" checked={v.skillsets.includes(opt)} onChange={() => toggleSkill(opt)} className="h-4 w-4 accent-amber-500" />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={labelCls}>Time per week</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {TIME_COMMITMENT.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-white/80">
              <input type="radio" name="timeCommitment" checked={v.timeCommitment === opt} onChange={() => set("timeCommitment", opt, true)} className="h-4 w-4 accent-amber-500" />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>City</label>
          <input value={v.city} onChange={(e) => set("city", e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>State</label>
          <select value={v.state} onChange={(e) => set("state", e.target.value, true)} className={inputCls}>
            <option value="">Select…</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-xs text-white/40">Changes save automatically.</p>
    </div>
  );
}
