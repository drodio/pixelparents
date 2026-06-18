"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BotIdClient } from "botid/client";
import {
  OHS_AFFILIATIONS,
  TECHNICAL_DEPTH,
  SKILLSETS,
  TIME_COMMITMENT,
} from "@/lib/options";
import { useAutoSave } from "@/lib/use-auto-save";
import { SaveStatus } from "@/components/save-status";
import {
  createDraftSignup,
  patchSignup,
  completeSignup,
  type SignupPatch,
} from "./actions";

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-sm text-red-400">{msg}</p>;
}

const labelCls = "block text-sm font-medium text-white/80";
const inputCls =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40";

const empty = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  githubUsername: "",
  linkedinHandle: "",
  ohsAffiliation: "",
  technicalDepth: "",
  timeCommitment: "",
  skillsets: [] as string[],
};

export default function SignupForm() {
  const router = useRouter();
  const [v, setV] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Draft row id, created lazily on the first save.
  const idRef = useRef<string | null>(null);
  const ensuring = useRef<Promise<string | null> | null>(null);
  const ensureId = useCallback(async (): Promise<string | null> => {
    if (idRef.current) return idRef.current;
    if (!ensuring.current) {
      ensuring.current = createDraftSignup().then((r) => {
        const id = "id" in r ? r.id : null;
        idRef.current = id;
        return id;
      });
    }
    return ensuring.current;
  }, []);

  const save = useCallback(
    async (patch: SignupPatch) => {
      const id = await ensureId();
      if (!id) throw new Error("no draft id");
      const res = await patchSignup(id, patch);
      if (!res.ok) throw new Error("save failed");
    },
    [ensureId],
  );
  const { queue, flush, status } = useAutoSave<SignupPatch>(save);

  function set<K extends keyof typeof empty>(key: K, value: (typeof empty)[K], immediate = false) {
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

  async function onContinue() {
    setSubmitting(true);
    setMessage(null);
    setErrors({});
    await flush();
    const id = idRef.current ?? (await ensureId());
    if (!id) {
      setMessage("Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }
    const res = await completeSignup(id);
    if (res.ok) {
      router.push(`/signup/thanks?id=${id}`);
    } else {
      setErrors(res.errors ?? {});
      if (res.message) setMessage(res.message);
      setSubmitting(false);
    }
  }

  return (
    <>
      <BotIdClient protect={[{ path: "/signup", method: "POST" }]} />
      <div className="flex flex-col gap-6">
        {message && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {message}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="firstName">
              First name <span className="text-red-400">*</span>
            </label>
            <input
              id="firstName"
              value={v.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              className={inputCls}
              autoComplete="given-name"
            />
            <FieldError msg={errors.firstName} />
          </div>
          <div>
            <label className={labelCls} htmlFor="lastName">
              Last name <span className="text-red-400">*</span>
            </label>
            <input
              id="lastName"
              value={v.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              className={inputCls}
              autoComplete="family-name"
            />
            <FieldError msg={errors.lastName} />
          </div>
          <div>
            <label className={labelCls} htmlFor="email">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              id="email"
              type="email"
              value={v.email}
              onChange={(e) => set("email", e.target.value)}
              className={inputCls}
              autoComplete="email"
            />
            <FieldError msg={errors.email} />
          </div>
          <div>
            <label className={labelCls} htmlFor="phone">
              Phone <span className="text-red-400">*</span>
            </label>
            <input
              id="phone"
              type="tel"
              value={v.phone}
              onChange={(e) => set("phone", e.target.value)}
              className={inputCls}
              autoComplete="tel"
            />
            <FieldError msg={errors.phone} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="githubUsername">
              GitHub username
            </label>
            <div className="mt-1 flex items-center rounded-lg border border-white/15 bg-white/5 focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/40">
              <span className="select-none px-3 py-2 text-sm text-white/40">github.com/</span>
              <input
                id="githubUsername"
                value={v.githubUsername}
                onChange={(e) => set("githubUsername", e.target.value)}
                placeholder="your-username"
                className="w-full rounded-r-lg bg-transparent py-2 pr-3 text-white placeholder-white/30 outline-none"
              />
            </div>
            <FieldError msg={errors.githubUsername} />
          </div>
        </div>

        <fieldset>
          <legend className={labelCls}>
            Stanford OHS affiliation <span className="text-red-400">*</span>
          </legend>
          <div className="mt-2 flex flex-col gap-2">
            {OHS_AFFILIATIONS.map((opt) => (
              <label key={opt} className="flex items-start gap-2 text-sm text-white/80">
                <input
                  type="radio"
                  name="ohsAffiliation"
                  checked={v.ohsAffiliation === opt}
                  onChange={() => set("ohsAffiliation", opt, true)}
                  className="mt-1 h-4 w-4 accent-amber-500"
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
          <FieldError msg={errors.ohsAffiliation} />
        </fieldset>

        <fieldset>
          <legend className={labelCls}>Technical depth</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {TECHNICAL_DEPTH.map((opt) => (
              <label key={opt} className="flex items-start gap-2 text-sm text-white/80">
                <input
                  type="radio"
                  name="technicalDepth"
                  checked={v.technicalDepth === opt}
                  onChange={() => set("technicalDepth", opt, true)}
                  className="mt-1 h-4 w-4 accent-amber-500"
                />
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
              value={v.linkedinHandle}
              onChange={(e) => set("linkedinHandle", e.target.value)}
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
                <input
                  type="checkbox"
                  checked={v.skillsets.includes(opt)}
                  onChange={() => toggleSkill(opt)}
                  className="h-4 w-4 accent-amber-500"
                />
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
                <input
                  type="radio"
                  name="timeCommitment"
                  checked={v.timeCommitment === opt}
                  onChange={() => set("timeCommitment", opt, true)}
                  className="h-4 w-4 accent-amber-500"
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={onContinue}
            disabled={submitting}
            className="rounded-full bg-white px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "…" : "Continue →"}
          </button>
          <SaveStatus status={status} />
        </div>
        <p className="text-xs text-white/40">Your answers save automatically as you go.</p>
      </div>
    </>
  );
}
