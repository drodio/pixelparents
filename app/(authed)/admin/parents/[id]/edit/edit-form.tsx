"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  OHS_AFFILIATIONS,
  TECHNICAL_DEPTH,
  SKILLSETS,
  TIME_COMMITMENT,
  US_STATES,
} from "@/lib/options";
import type { SignupRow } from "@/lib/db/schema/signups";
import { updateSignup, type EditState } from "./actions";

const initial: EditState = { ok: false };
const labelCls = "block text-sm font-medium text-white/80";
const inputCls =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40";

function Err({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-sm text-red-400">{msg}</p> : null;
}

export default function EditForm({ row }: { row: SignupRow }) {
  const [state, action, pending] = useActionState(updateSignup, initial);
  const errors = state.errors ?? {};
  const handle = (row.linkedinUrl ?? "").replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, "");
  const skills = new Set(row.skillsets ?? []);

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={row.id} />
      {state.message && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {state.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>First name *</label>
          <input name="firstName" defaultValue={row.firstName} className={inputCls} />
          <Err msg={errors.firstName} />
        </div>
        <div>
          <label className={labelCls}>Last name *</label>
          <input name="lastName" defaultValue={row.lastName} className={inputCls} />
          <Err msg={errors.lastName} />
        </div>
        <div>
          <label className={labelCls}>Email *</label>
          <input name="email" defaultValue={row.email} className={inputCls} />
          <Err msg={errors.email} />
        </div>
        <div>
          <label className={labelCls}>Phone *</label>
          <input name="phone" defaultValue={row.phone} className={inputCls} />
          <Err msg={errors.phone} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>GitHub username *</label>
          <div className="mt-1 flex items-center rounded-lg border border-white/15 bg-white/5 focus-within:border-white/40">
            <span className="select-none px-3 py-2 text-sm text-white/40">github.com/</span>
            <input
              name="githubUsername"
              defaultValue={row.githubUsername}
              className="w-full rounded-r-lg bg-transparent py-2 pr-3 text-white outline-none"
            />
          </div>
          <Err msg={errors.githubUsername} />
        </div>
      </div>

      <fieldset>
        <legend className={labelCls}>OHS affiliation *</legend>
        <div className="mt-2 flex flex-col gap-2">
          {OHS_AFFILIATIONS.map((opt) => (
            <label key={opt} className="flex items-start gap-2 text-sm text-white/80">
              <input type="radio" name="ohsAffiliation" value={opt} defaultChecked={row.ohsAffiliation === opt} className="mt-1 h-4 w-4 accent-amber-500" />
              <span>{opt}</span>
            </label>
          ))}
        </div>
        <Err msg={errors.ohsAffiliation} />
      </fieldset>

      <fieldset>
        <legend className={labelCls}>Technical depth</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {TECHNICAL_DEPTH.map((opt) => (
            <label key={opt} className="flex items-start gap-2 text-sm text-white/80">
              <input type="radio" name="technicalDepth" value={opt} defaultChecked={row.technicalDepth === opt} className="mt-1 h-4 w-4 accent-amber-500" />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className={labelCls}>LinkedIn</label>
        <div className="mt-1 flex items-center rounded-lg border border-white/15 bg-white/5 focus-within:border-white/40">
          <span className="select-none px-3 py-2 text-sm text-white/40">linkedin.com/in/</span>
          <input name="linkedinHandle" defaultValue={handle} className="w-full rounded-r-lg bg-transparent py-2 pr-3 text-white outline-none" />
        </div>
        <Err msg={errors.linkedinHandle} />
      </div>

      <fieldset>
        <legend className={labelCls}>Skillsets</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SKILLSETS.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-white/80">
              <input type="checkbox" name="skillsets" value={opt} defaultChecked={skills.has(opt)} className="h-4 w-4 accent-amber-500" />
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
              <input type="radio" name="timeCommitment" value={opt} defaultChecked={row.timeCommitment === opt} className="h-4 w-4 accent-amber-500" />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>City</label>
          <input name="city" defaultValue={row.city ?? ""} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>State</label>
          <select name="state" defaultValue={row.state ?? ""} className={inputCls}>
            <option value="">Select…</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-white px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link
          href={`/signup/thanks?id=${row.id}&admin=1`}
          className="text-sm font-medium text-amber-400 hover:underline"
        >
          Edit family + child(ren) details →
        </Link>
      </div>
    </form>
  );
}
