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
  createCoParentDraft,
  patchSignup,
  completeSignup,
  sendCoParentInvites,
  type SignupPatch,
} from "./actions";
import { parseInviteEmails } from "@/lib/invite";

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

// `joinToken`, when present, puts the form in co-parent "join mode": the draft
// is attached to an EXISTING family (via createCoParentDraft) instead of minting
// a new one, so the invitee's children come from the shared family.
export default function SignupForm({ joinToken }: { joinToken?: string } = {}) {
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
      const create = joinToken ? createCoParentDraft(joinToken) : createDraftSignup();
      ensuring.current = create.then((r) => {
        const id = "id" in r ? r.id : null;
        idRef.current = id;
        return id;
      });
    }
    return ensuring.current;
  }, [joinToken]);

  // --- Co-parent invite UI state ---
  const [inviteRaw, setInviteRaw] = useState("");
  const [confirmEmails, setConfirmEmails] = useState<string[] | null>(null);
  const [inviteState, setInviteState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [inviteNote, setInviteNote] = useState<string | null>(null);

  function onInviteClick() {
    setInviteNote(null);
    const emails = parseInviteEmails(inviteRaw);
    if (emails.length === 0) {
      setInviteNote("Enter one or more valid email addresses, separated by commas.");
      return;
    }
    setConfirmEmails(emails);
  }

  async function onConfirmInvite() {
    const emails = confirmEmails ?? [];
    setConfirmEmails(null);
    setInviteState("sending");
    setInviteNote(null);
    const id = idRef.current ?? (await ensureId());
    if (!id) {
      setInviteState("error");
      setInviteNote("Something went wrong. Please try again.");
      return;
    }
    const res = await sendCoParentInvites(id, emails);
    if (res.ok && res.sent > 0) {
      setInviteState("sent");
      setInviteRaw("");
      setInviteNote(
        `Sent ${res.sent} invite${res.sent === 1 ? "" : "s"}. They'll get a link to fill out their info.`,
      );
    } else {
      setInviteState("error");
      setInviteNote("We couldn't send those invites. Please try again.");
    }
  }

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

        {/* Invite a spouse / other parent(s) to fill out their own info. They
            join the same family and share these children. */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <label className={labelCls} htmlFor="coParentInvites">
            Invite your spouse / other parent(s) to fill their information out, too:
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="coParentInvites"
              value={inviteRaw}
              onChange={(e) => {
                setInviteRaw(e.target.value);
                if (inviteState !== "idle") setInviteState("idle");
              }}
              placeholder="comma separated emails"
              className={`${inputCls} mt-0 flex-1`}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={onInviteClick}
              className="shrink-0 rounded-full border border-white/30 px-5 py-2 font-semibold text-white transition-colors hover:bg-white/10"
            >
              Invite
            </button>
          </div>
          {inviteNote && (
            <p
              className={`mt-2 text-sm ${
                inviteState === "sent" ? "text-emerald-300" : inviteState === "error" ? "text-red-300" : "text-white/60"
              }`}
            >
              {inviteNote}
            </p>
          )}
        </div>

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

      {/* Custom in-app confirmation dialog (not window.confirm). */}
      {confirmEmails && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmEmails(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-white/15 bg-neutral-900 p-6 text-white shadow-2xl"
          >
            <p className="text-sm text-white/85">
              About to send invites to {confirmEmails.join(", ")}. They will have the ability to make
              edits to your family and children information.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmEmails(null)}
                className="rounded-full border border-white/30 px-5 py-2 font-semibold text-white transition-colors hover:bg-white/10"
              >
                No, cancel
              </button>
              <button
                type="button"
                onClick={onConfirmInvite}
                className="rounded-full bg-white px-5 py-2 font-semibold text-black transition-opacity hover:opacity-90"
              >
                Yes, invite them
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
