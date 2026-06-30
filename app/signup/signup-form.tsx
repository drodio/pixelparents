"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BotIdClient } from "botid/client";
import {
  OHS_AFFILIATIONS,
  TECHNICAL_DEPTH,
  SKILLSETS,
  TIME_COMMITMENT,
  US_STATES,
} from "@/lib/options";
import { useAutoSave } from "@/lib/use-auto-save";
import { SaveStatus } from "@/components/save-status";
import { IconWarning } from "@/components/icons";
import {
  createDraftSignup,
  createCoParentDraft,
  patchSignup,
  completeSignup,
  sendCoParentInvites,
  type SignupPatch,
} from "./actions";
import { parseInviteEmails } from "@/lib/invite";
import { TagPicker, PhotoUploader } from "./thanks/family-form";

// Bump when the `empty` shape changes incompatibly — stored drafts from an older
// shape are discarded on restore rather than spread in with stale keys.
const DRAFT_VERSION = 1;

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-sm text-red-400">{msg}</p>;
}

const labelCls = "block text-sm font-medium text-white/80";
// Section headers (fieldset legends) are bold to stand out from field labels.
const legendCls = "block text-sm font-bold text-white/80";
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
  parentInterests: [] as string[],
  city: "",
  state: "",
  // Resource-for-students opt-in (only surfaced once LinkedIn is filled).
  // Defaults to "yes" to match the pre-checked option in the prompt.
  studentResource: "yes" as "yes" | "no",
  // Interest in helping build Pixel Parents software (no default selection).
  builderInterest: "" as "" | "builder" | "aspiring" | "no",
};

// `joinToken`, when present, puts the form in co-parent "join mode": the draft
// is attached to an EXISTING family (via createCoParentDraft) instead of minting
// a new one, so the invitee's children come from the shared family.
export default function SignupForm({
  suggestedInterests = [],
  joinToken,
}: {
  suggestedInterests?: string[];
  joinToken?: string;
} = {}) {
  const router = useRouter();
  const [v, setV] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Local-draft persistence: keep the typed answers (and the draft row id) in
  // localStorage so a page refresh — even after a failed server save — restores
  // everything instead of starting blank. Scoped per join token so co-parent
  // invites don't collide with a fresh signup. Cleared on successful completion.
  const ID_KEY = joinToken ? `pp_signup_draft_id_${joinToken}` : "pp_signup_draft_id";
  const V_KEY = joinToken ? `pp_signup_draft_v_${joinToken}` : "pp_signup_draft_v";

  // Draft row id, created lazily on the first save.
  const idRef = useRef<string | null>(null);
  // Skip the persist effect's first run (the initial empty state on mount) so we
  // never clobber a saved draft before the restore effect re-renders with it.
  const skipFirstPersist = useRef(true);

  // Restore any saved draft on mount. This is the canonical "hydrate from
  // localStorage" pattern: a controlled form can't read localStorage in a lazy
  // useState initializer without an SSR hydration mismatch, so we render the
  // empty state first and patch it in a one-shot mount effect. The set-state rule
  // is a false positive here (no render loop — empty dep array, runs once).
  useEffect(() => {
    try {
      const savedV = window.localStorage.getItem(V_KEY);
      if (savedV) {
        const blob = JSON.parse(savedV) as { ver?: number; v?: Partial<typeof empty> };
        if (blob?.ver === DRAFT_VERSION && blob.v) {
          const parsed = blob.v;
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setV((prev) => ({ ...prev, ...parsed }));
        } else {
          window.localStorage.removeItem(V_KEY);
        }
      }
      const savedId = window.localStorage.getItem(ID_KEY);
      if (savedId) idRef.current = savedId;
    } catch {
      /* corrupt/blocked storage — start fresh */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the form values whenever they change (skipping the initial mount).
  useEffect(() => {
    if (skipFirstPersist.current) {
      skipFirstPersist.current = false;
      return;
    }
    try {
      window.localStorage.setItem(V_KEY, JSON.stringify({ ver: DRAFT_VERSION, v }));
    } catch {
      /* storage full/blocked — non-fatal */
    }
  }, [v, V_KEY]);
  const ensuring = useRef<Promise<string | null> | null>(null);
  const ensureId = useCallback(async (): Promise<string | null> => {
    if (idRef.current) return idRef.current;
    if (!ensuring.current) {
      const create = joinToken ? createCoParentDraft(joinToken) : createDraftSignup();
      ensuring.current = create.then((r) => {
        const id = "id" in r ? r.id : null;
        idRef.current = id;
        if (id && typeof window !== "undefined") {
          try {
            window.localStorage.setItem(ID_KEY, id);
          } catch {
            /* storage blocked — non-fatal */
          }
        }
        return id;
      });
    }
    return ensuring.current;
  }, [joinToken, ID_KEY]);

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
      const reserved = res.reserved ?? res.sent;
      // Two distinct shortfalls: quota trimmed by the lifetime cap (reserved <
      // requested) vs. individual sends that failed (sent < reserved).
      const cappedShort = reserved < res.requested;
      const failedShort = res.sent < reserved;
      let note = `Sent ${res.sent} invite${res.sent === 1 ? "" : "s"}. They'll get a link to fill out their info.`;
      if (failedShort) note += ` (${reserved - res.sent} couldn't be sent — please try again.)`;
      if (cappedShort) note += ` (${res.requested - reserved} not sent — invite limit reached.)`;
      setInviteNote(note);
    } else if (res.error === "limit") {
      setInviteState("error");
      setInviteNote("You've reached the invite limit for this signup.");
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
  // LinkedIn drives the student-resource pill box. When a handle is present we
  // also persist the current opt-in choice (default "yes") so it isn't lost if
  // the parent leaves the pre-checked option untouched.
  function setLinkedin(value: string) {
    setV((prev) => ({ ...prev, linkedinHandle: value }));
    const patch: SignupPatch = { linkedinHandle: value };
    if (value.trim() !== "") patch.studentResourceOptIn = v.studentResource === "yes";
    queue(patch);
  }
  function setStudentResource(choice: "yes" | "no") {
    setV((prev) => ({ ...prev, studentResource: choice }));
    queue({ studentResourceOptIn: choice === "yes" }, true);
  }
  function setBuilderInterest(choice: "builder" | "aspiring" | "no") {
    setV((prev) => ({ ...prev, builderInterest: choice }));
    queue({ builderInterest: choice }, true);
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
    // Force a full save of the current values before completing. This covers the
    // case where answers were restored from a local draft (after a failed save +
    // refresh) and were never re-queued — without it, completeSignup could read a
    // stale DB row and fail validation on data the user can plainly see.
    try {
      await save({
        firstName: v.firstName,
        lastName: v.lastName,
        email: v.email,
        phone: v.phone,
        githubUsername: v.githubUsername,
        linkedinHandle: v.linkedinHandle,
        ohsAffiliation: v.ohsAffiliation,
        technicalDepth: v.technicalDepth,
        timeCommitment: v.timeCommitment,
        skillsets: v.skillsets,
        parentInterests: v.parentInterests,
        city: v.city,
        state: v.state,
        builderInterest: v.builderInterest,
        ...(v.linkedinHandle.trim() !== ""
          ? { studentResourceOptIn: v.studentResource === "yes" }
          : {}),
      });
    } catch {
      setMessage("We couldn't save your info. Please check your connection and try again.");
      setSubmitting(false);
      return;
    }
    const res = await completeSignup(id);
    if (res.ok) {
      // Signup is persisted server-side now — drop the local draft so a later
      // visit starts clean.
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(ID_KEY);
          window.localStorage.removeItem(V_KEY);
        } catch {
          /* non-fatal */
        }
      }
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

        <h2 className="text-xl font-semibold text-white">First Parent&apos;s Info:</h2>

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
            <label className={labelCls} htmlFor="linkedinHandle">
              LinkedIn (this really helps other parents get to know you)
            </label>
            <div className="mt-1 flex items-center rounded-lg border border-white/15 bg-white/5 focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/40">
              <span className="select-none px-3 py-2 text-sm text-white/40">linkedin.com/in/</span>
              <input
                id="linkedinHandle"
                value={v.linkedinHandle}
                onChange={(e) => setLinkedin(e.target.value)}
                placeholder="your-handle"
                className="w-full rounded-r-lg bg-transparent py-2 pr-3 text-white placeholder-white/30 outline-none"
              />
            </div>
            <FieldError msg={errors.linkedinHandle} />
          </div>

          {v.linkedinHandle.trim() !== "" && (
            <div className="sm:col-span-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
              <p className="text-sm font-bold text-white/80">
                OHS Students&apos; <span className="text-amber-400">#1 ask</span> is
                to connect with other parents (like you!) around your subject
                matter expertise, so they can learn faster and with more variety.
              </p>
              <p className="mt-2 text-sm text-white/80">
                Are you interested in being an available resource to OHS students?
                (Examples: A 30 minute Zoom call to provide advice about your
                career specialty. A small dinner with students and parents to
                discuss a topic you have expertise in, etc.)
              </p>
              <p className="mt-2 text-sm text-white/80">
                <strong>We are building some software to enable this.</strong> You
                will be able to accept / decline any specific student requests.
              </p>
              <div className="mt-3 flex flex-col gap-3">
                <label className="flex items-start gap-2 text-sm text-white/80">
                  <input
                    type="radio"
                    name="studentResource"
                    checked={v.studentResource === "yes"}
                    onChange={() => setStudentResource("yes")}
                    className="mt-1 h-4 w-4 accent-amber-500"
                  />
                  <span>
                    Yes! Please use my LinkedIn profile to automatically build a
                    profile out about me and my expertise that will be shared
                    with students.{" "}
                    <em>(you&apos;ll be able to edit it after the initial pass)</em>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-white/80">
                  <input
                    type="radio"
                    name="studentResource"
                    checked={v.studentResource === "no"}
                    onChange={() => setStudentResource("no")}
                    className="mt-1 h-4 w-4 accent-amber-500"
                  />
                  <span>
                    No, I&apos;m not able to be available for OHS student requests
                    right now
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="city">City</label>
            <input
              id="city"
              value={v.city}
              onChange={(e) => set("city", e.target.value)}
              className={inputCls}
              autoComplete="address-level2"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="state">State</label>
            <select
              id="state"
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
        </div>

        <div>
          <h3 className="text-base font-semibold text-white">
            Your interests (select existing or add new ones)
          </h3>
          <TagPicker
            value={v.parentInterests}
            onChange={(next) => set("parentInterests", next, true)}
            suggestions={suggestedInterests}
            placeholder="Type an interest and press Enter"
          />
        </div>

        <div>
          <h3 className="text-base font-semibold text-white">
            Would you like to share photos of you with your family?
          </h3>
          <p className="mt-1 text-xs text-white/40">
            Resized &amp; optimized in your browser before upload. Add as many as
            you&rsquo;d like.
          </p>
          <PhotoUploader
            initialPhotos={[]}
            initialPreviews={{}}
            onSave={(photos) => queue({ photos }, true)}
            candidates={[]}
            showMainPill
          />
        </div>

        <fieldset>
          <legend className={legendCls}>
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
          <legend className={legendCls}>
            Are you interested in helping us build Pixel Parents software?{" "}
            <span className="text-red-400">*</span>
          </legend>
          <div className="mt-2 flex flex-col gap-2">
            {[
              {
                value: "builder" as const,
                label:
                  "Yes! I am a builder (technical / software developer / engineer / etc) and I'd like to contribute",
              },
              {
                value: "aspiring" as const,
                label: "Yes! But I'm not a builder, although I'd like to become one",
              },
              {
                value: "no" as const,
                label: "No, that's far from my interests or area of expertise",
              },
            ].map((opt) => (
              <label
                key={opt.value}
                className="flex items-start gap-2 text-sm text-white/80"
              >
                <input
                  type="radio"
                  name="builderInterest"
                  checked={v.builderInterest === opt.value}
                  onChange={() => setBuilderInterest(opt.value)}
                  className="mt-1 h-4 w-4 accent-amber-500"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          <FieldError msg={errors.builderInterest} />

          {v.builderInterest === "builder" && (
            <div className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-white/80">
              <strong>Welcome, technical parent!</strong> We appreciate you. Read
              our{" "}
              <a
                href="https://pixelparents.org/builders"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 underline decoration-amber-400/60 underline-offset-2 hover:text-amber-300"
              >
                builder guidelines page
              </a>{" "}
              to learn more about how we build together.
            </div>
          )}

          {v.builderInterest === "aspiring" && (
            <div className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-white/80">
              <em>
                If you are not yet a builder, but want to become one, this parents
                tech builder group is the perfect place to start.
              </em>{" "}
              Please read{" "}
              <a
                href="https://pixelparents.org/builders#frequently-asked-questions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 underline decoration-amber-400/60 underline-offset-2 hover:text-amber-300"
              >
                the FAQs on our builder guidelines page
              </a>{" "}
              to learn how to get started.
            </div>
          )}
        </fieldset>

        {/* Builders see GitHub, technical depth, and skillsets. */}
        {v.builderInterest === "builder" && (
          <>
            <div>
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

            <fieldset>
              <legend className={legendCls}>Technical depth</legend>
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

            <fieldset>
              <legend className={legendCls}>Skillsets</legend>
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
          </>
        )}

        {/* Both builders and aspiring builders see the time-commitment question. */}
        {(v.builderInterest === "builder" || v.builderInterest === "aspiring") && (
          <fieldset>
            <legend className={legendCls}>
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
        )}

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
              className="shrink-0 rounded-lg border border-white/30 px-5 py-2 font-semibold text-white transition-colors hover:bg-white/10"
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

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onContinue}
            disabled={submitting || status === "error"}
            title={status === "error" ? "Your info hasn't been saved yet — retry the save first." : undefined}
            className="rounded-lg bg-white px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "…" : "Add Your Child(ren) →"}
          </button>
          {/* On save failure, retry is the ONLY way forward — the button above is
              disabled until the save succeeds. */}
          {status === "error" ? (
            <button
              type="button"
              onClick={() => void flush()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20"
            >
              <IconWarning className="h-4 w-4" /> Couldn&apos;t save — click to retry
            </button>
          ) : (
            <SaveStatus status={status} />
          )}
        </div>
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
