"use client";

import { useActionState } from "react";
import { BotIdClient } from "botid/client";
import {
  OHS_AFFILIATIONS,
  TECHNICAL_DEPTH,
  SKILLSETS,
  TIME_COMMITMENT,
} from "@/lib/options";
import { submitSignup, type SignupState } from "./actions";

const initialState: SignupState = { ok: false };

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-sm text-red-400">{msg}</p>;
}

const labelCls = "block text-sm font-medium text-white/80";
const inputCls =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40";

export default function SignupForm() {
  const [state, formAction, pending] = useActionState(submitSignup, initialState);
  const errors = state.errors ?? {};

  return (
    <>
      <BotIdClient protect={[{ path: "/signup", method: "POST" }]} />
      <form action={formAction} className="flex flex-col gap-6">
        {state.message && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {state.message}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="firstName">
              First name <span className="text-red-400">*</span>
            </label>
            <input id="firstName" name="firstName" className={inputCls} autoComplete="given-name" />
            <FieldError msg={errors.firstName} />
          </div>
          <div>
            <label className={labelCls} htmlFor="lastName">
              Last name <span className="text-red-400">*</span>
            </label>
            <input id="lastName" name="lastName" className={inputCls} autoComplete="family-name" />
            <FieldError msg={errors.lastName} />
          </div>
          <div>
            <label className={labelCls} htmlFor="email">
              Email <span className="text-red-400">*</span>
            </label>
            <input id="email" name="email" type="email" className={inputCls} autoComplete="email" />
            <FieldError msg={errors.email} />
          </div>
          <div>
            <label className={labelCls} htmlFor="phone">
              Phone <span className="text-red-400">*</span>
            </label>
            <input id="phone" name="phone" type="tel" className={inputCls} autoComplete="tel" />
            <FieldError msg={errors.phone} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="githubUsername">
              GitHub username <span className="text-red-400">*</span>
            </label>
            <div className="mt-1 flex items-center rounded-lg border border-white/15 bg-white/5 focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/40">
              <span className="select-none px-3 py-2 text-sm text-white/40">github.com/</span>
              <input
                id="githubUsername"
                name="githubUsername"
                placeholder="your-username"
                className="w-full rounded-r-lg bg-transparent py-2 pr-3 text-white placeholder-white/30 outline-none"
              />
            </div>
            <FieldError msg={errors.githubUsername} />
          </div>
        </div>

        <fieldset>
          <legend className={labelCls}>Stanford OHS affiliation</legend>
          <div className="mt-2 flex flex-col gap-2">
            {OHS_AFFILIATIONS.map((opt) => (
              <label key={opt} className="flex items-start gap-2 text-sm text-white/80">
                <input type="radio" name="ohsAffiliation" value={opt} className="mt-1 h-4 w-4 accent-amber-500" />
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
                <input type="radio" name="technicalDepth" value={opt} className="mt-1 h-4 w-4 accent-amber-500" />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label className={labelCls} htmlFor="linkedinHandle">
            LinkedIn
          </label>
          <div className="mt-1 flex items-center rounded-lg border border-white/15 bg-white/5 focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/40">
            <span className="select-none px-3 py-2 text-sm text-white/40">linkedin.com/in/</span>
            <input
              id="linkedinHandle"
              name="linkedinHandle"
              placeholder="your-handle"
              className="w-full rounded-r-lg bg-transparent py-2 pr-3 text-white placeholder-white/30 outline-none"
            />
          </div>
          <FieldError msg={errors.linkedinHandle} />
        </div>

        <fieldset>
          <legend className={labelCls}>Skillsets</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {SKILLSETS.map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-sm text-white/80">
                <input type="checkbox" name="skillsets" value={opt} className="h-4 w-4 accent-amber-500" />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className={labelCls}>
            How much time can you dedicate to building software for OHS parents?
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {TIME_COMMITMENT.map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-sm text-white/80">
                <input type="radio" name="timeCommitment" value={opt} className="h-4 w-4 accent-amber-500" />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-full bg-white px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Submitting…" : "Sign up"}
        </button>
      </form>
    </>
  );
}
