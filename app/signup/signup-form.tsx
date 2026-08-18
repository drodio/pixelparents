"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BotIdClient } from "botid/client";
import { affiliationForRole } from "@/lib/options";
import { useAutoSave } from "@/lib/use-auto-save";
import { SaveStatus } from "@/components/save-status";
import { IconWarning } from "@/components/icons";
import { countryHint, formatPhone } from "@/lib/phone";
import {
  createDraftSignup,
  createCoParentDraft,
  patchSignup,
  completeSignup,
  type SignupPatch,
} from "./actions";

// Bump when the `empty` shape changes incompatibly — stored drafts from an older
// shape are discarded on restore rather than spread in with stale keys.
const DRAFT_VERSION = 3;

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-sm text-red-400">{msg}</p>;
}

// Grouped section card: a titled, bordered container that gives related fields a
// clear visual home and consistent rhythm. Each section opens with a heading (+
// optional description) so the long form reads as a handful of steps instead of
// one wall of inputs. Purely presentational — no field/state lives here.
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
      <div className="mb-5 border-b border-white/10 pb-4">
        <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-white/55">{description}</p>}
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

const labelCls = "block text-sm font-medium text-white/80";
const inputCls =
  "mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white placeholder-white/30 outline-none transition-colors focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/60";

const empty = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  githubUsername: "",
  linkedinHandle: "",
  // Optional WeChat ID, surfaced to parents only. Many OHS parent families
  // coordinate on WeChat rather than LinkedIn/email (parent feedback, Jul 2026).
  wechatId: "",
  // Personal/company website (optional). Stored in extra.websiteUrl; one of the
  // public sources the opt-in enrichment can build a profile from.
  websiteUrl: "",
  // Opt-in: build my profile automatically from public data. DEFAULT OFF.
  enrichmentOptIn: false,
  ohsAffiliation: "",
  technicalDepth: "",
  timeCommitment: "",
  skillsets: [] as string[],
  parentInterests: [] as string[],
  city: "",
  state: "",
  // OHS is global; default to the most common country (matches lib/options.ts).
  country: "United States",
  // Resource-for-students opt-in (only surfaced once LinkedIn is filled).
  // Defaults to "yes" to match the pre-checked option in the prompt.
  studentResource: "yes" as "yes" | "no",
  // Interest in helping build GoPixel software (no default selection).
  builderInterest: "" as "" | "builder" | "aspiring" | "no",
  // Who's signing up. Default "parent" keeps the parent path exactly as before;
  // "student" routes step-2 to "add your parent / guardian". In co-parent join
  // mode this is forced to "parent" (a co-parent is always a parent).
  accountType: "parent" as "parent" | "student" | "alum",
  // Community terms. Required before an account can be completed — conduct
  // rules have to be agreed BEFORE anyone can post, or enforcement rests on
  // rules nobody consented to.
  termsAccepted: false,
};

// `joinToken`, when present, puts the form in co-parent "join mode": the draft
// is attached to an EXISTING family (via createCoParentDraft) instead of minting
// a new one, so the invitee's children come from the shared family.
export default function SignupForm({
  joinToken,
  refToken,
  defaultAccountType,
}: {
  joinToken?: string;
  // Referral attribution token from a "spread the word" link (?ref=…). Passed to
  // createDraftSignup so the new family records who referred them. No PII.
  refToken?: string;
  // When a student referral link is opened (?as=student), default the new account
  // to the student flow so the friend lands in the right signup path.
  defaultAccountType?: "parent" | "student" | "alum";
} = {}) {
  const router = useRouter();
  const [v, setV] = useState(() =>
    defaultAccountType ? { ...empty, accountType: defaultAccountType } : empty,
  );
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
  // Why the last draft-creation attempt failed, so the UI can show an actionable
  // message ("blocked" = bot-check/VPN/ad-blocker vs "failed" = transient) instead
  // of a generic error or a silently-dead button.
  const ensureError = useRef<null | "blocked" | "failed">(null);
  // Render-visible mirror of `ensureError`. The ref has to stay: onContinue reads
  // the reason SYNCHRONOUSLY right after `await ensureId()`, and a state update
  // wouldn't have flushed by then. But a ref can't drive render (it doesn't
  // re-render, and reading it during render is a React-hooks lint error), so the
  // autosave-failure message reads this instead. Both are set together.
  const [ensureErrorView, setEnsureErrorView] = useState<null | "blocked" | "failed">(null);
  const ensureId = useCallback(async (): Promise<string | null> => {
    if (idRef.current) return idRef.current;
    if (!ensuring.current) {
      const create = joinToken ? createCoParentDraft(joinToken) : createDraftSignup(refToken);
      ensuring.current = create
        .then((r) => {
          if ("id" in r) {
            ensureError.current = null;
            setEnsureErrorView(null);
            idRef.current = r.id;
            if (typeof window !== "undefined") {
              try {
                window.localStorage.setItem(ID_KEY, r.id);
              } catch {
                /* storage blocked — non-fatal */
              }
            }
            return r.id;
          }
          // Draft creation failed. Record WHY and clear the in-flight promise so a
          // later retry actually re-attempts — otherwise this resolved-to-null
          // promise stays cached and wedges every future save AND invite on the
          // same failure (the button reads as permanently "not clickable").
          ensureError.current = r.error === "blocked" ? "blocked" : "failed";
          setEnsureErrorView(ensureError.current);
          ensuring.current = null;
          return null;
        })
        .catch((err) => {
          console.error("ensureId draft creation threw:", err);
          ensureError.current = "failed";
          setEnsureErrorView("failed");
          ensuring.current = null;
          return null;
        });
    }
    return ensuring.current;
  }, [joinToken, refToken, ID_KEY]);

  // Message for a draft-creation failure — distinguishes a bot-check/privacy block
  // (recoverable by the user) from a transient save error.
  const draftErrorMessage = () =>
    ensureError.current === "blocked"
      ? "We couldn't verify your browser. If you're using a VPN, private relay, or an ad/tracker blocker, turn it off for this page and try again."
      : "Something went wrong saving your info. Please check your connection and try again.";




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
  // Role choice (parent vs student). Persisted immediately so the thanks page
  // (read server-side from extra.accountType) routes to the right step-2.
  // For a student or an alum, "Stanford OHS affiliation" is fully determined by
  // the role they already picked in "Who's signing up?" — asking again is pure
  // duplicated friction (parent feedback, Jul 2026). Only a PARENT has a real
  // choice to make (new / existing / previous), so only a parent is asked.
  function setAccountType(choice: "parent" | "student" | "alum") {
    // Derive + persist the affiliation in the SAME save as the role, so the
    // hidden field is always populated before completeSignup validates it.
    // Switching back to "parent" clears it (affiliationForRole returns "") so
    // they answer for themselves rather than silently submitting a student one.
    const derived = affiliationForRole(choice);
    setV((prev) => ({ ...prev, accountType: choice, ohsAffiliation: derived }));
    queue({ accountType: choice, ohsAffiliation: derived }, true);
  }

  async function onContinue() {
    // Terms are enforced HERE rather than by disabling the button.
    //
    // A disabled submit is a dead end: the member gets no explanation, and if the
    // checkbox state were ever wrong they would be silently unable to sign up
    // with nothing to act on. Signup has been broken twice by exactly that shape
    // of failure, so this path fails safe — the click always registers and the
    // reason is always visible.
    if (!v.termsAccepted) {
      setErrors({ termsAccepted: "Please agree to the community terms to continue." });
      setMessage("Please agree to the community terms to continue.");
      // Bring the checkbox into view — on a phone it sits below the fold.
      if (typeof document !== "undefined") {
        document.getElementById("termsAccepted")?.scrollIntoView({ block: "center" });
      }
      return;
    }
    setSubmitting(true);
    setMessage(null);
    setErrors({});
    try {
    await flush();
    const id = idRef.current ?? (await ensureId());
    if (!id) {
      setMessage(draftErrorMessage());
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
        wechatId: v.wechatId,
        termsAccepted: v.termsAccepted,
        websiteUrl: v.websiteUrl,
        enrichmentOptIn: v.enrichmentOptIn,
        ohsAffiliation: v.ohsAffiliation,
        technicalDepth: v.technicalDepth,
        timeCommitment: v.timeCommitment,
        skillsets: v.skillsets,
        parentInterests: v.parentInterests,
        city: v.city,
        country: v.country,
        // State only applies to US families; clear it otherwise so a switched
        // country doesn't leave a stale state on the row.
        state: v.country === "United States" ? v.state : "",
        builderInterest: v.builderInterest,
        // In join mode a co-parent is always a parent; otherwise persist the
        // chosen role so the thanks page routes to the right step-2.
        accountType: joinToken ? "parent" : v.accountType,
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
      const errs = res.errors ?? {};
      setErrors(errs);
      // completeSignup returns no top-level message for pure field errors, and
      // the required fields live at the TOP of a long form while the submit
      // button is at the very bottom — so a blank early field looked like a dead
      // button (no scroll, no focus, no banner near the button). Always give
      // visible feedback: set a generic message AND scroll/focus the first
      // errored field into view.
      const keys = Object.keys(errs);
      if (res.message) {
        setMessage(res.message);
      } else if (keys.length > 0) {
        setMessage("Please fix the highlighted fields above.");
      }
      if (typeof document !== "undefined" && keys.length > 0) {
        // Focus the first errored field that has a matching DOM element (some
        // errors, e.g. section-level ones, may not map to a focusable input —
        // fall back to scrolling whichever element we can find).
        const first = keys
          .map((k) => document.getElementById(k))
          .find((el): el is HTMLElement => el != null);
        if (first) {
          first.scrollIntoView({ behavior: "smooth", block: "center" });
          if (typeof (first as HTMLElement).focus === "function") {
            first.focus({ preventScroll: true });
          }
        }
      }
      setSubmitting(false);
    }
    } catch (err) {
      // Safety net: any unexpected throw (completeSignup, flush, a transient
      // network error) must NEVER leave `submitting` stuck true — that disables
      // the "Add Your Child(ren)" button with NO error shown, which reads exactly
      // as a dead/unclickable button with "no unfilled fields." Always surface a
      // message and re-enable so the user can retry.
      console.error("onContinue failed:", err);
      setMessage("Something went wrong finishing your signup. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <BotIdClient protect={[{ path: "/signup", method: "POST" }]} />
      <div className="flex flex-col gap-8">
        {message && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {message}
          </p>
        )}

        {/* Role choice — who is signing up. Hidden in co-parent join mode (an
            invited co-parent is always a parent joining an existing family). */}
        {!joinToken && (
          <Section title="Who's signing up?">
            <fieldset>
              {/* The Section heading already asks the question, so the legend is
                  screen-reader-only — parent feedback (Jul 2026) was that the
                  stacked "Who's signing up?" / "I'm signing up as" headers read
                  as two separate questions. */}
              <legend className="sr-only">I&apos;m signing up as</legend>
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2 text-sm text-white/80">
                  <input
                    type="radio"
                    name="accountType"
                    checked={v.accountType === "parent"}
                    onChange={() => setAccountType("parent")}
                    className="mt-1 h-4 w-4 accent-amber-500"
                  />
                  <span>A parent / guardian</span>
                </label>
                <label className="flex items-start gap-2 text-sm text-white/80">
                  <input
                    type="radio"
                    name="accountType"
                    checked={v.accountType === "student"}
                    onChange={() => setAccountType("student")}
                    className="mt-1 h-4 w-4 accent-amber-500"
                  />
                  <span>A current OHS student</span>
                </label>
                {/* Alumni signup is PAUSED (V2 direction, Aug 2026): the option is
                    removed rather than hidden behind a flag. The "alum" account
                    type still exists in lib/options + display code because legacy
                    rows may carry it; only the entry point is gone. */}
              </div>
              {v.accountType === "student" && (
                <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-white/75">
                  Next, you&apos;ll add (invite) your parent or guardian so they can
                  join your family.
                </p>
              )}
            </fieldset>
          </Section>
        )}

        {/* This section always collects the SIGNING-UP person's own details.
            "First parent's info" (and before that, a role-blind version of it)
            read as "enter a parent before yourself" to students and made parents
            wonder who the "first" parent was — V2 feedback settled on the same
            "Your info" for every role, with no subtitle. */}
        <Section title="Your info">
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
            <p className="mt-1 text-xs text-white/40">
              We send your invites and updates here — use <strong>your own</strong>{" "}
              email, not your child&apos;s. (There&apos;s a separate spot for your
              student&apos;s email in the next step.)
            </p>
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
              onBlur={() => {
                const f = formatPhone(v.phone);
                if (f !== v.phone) set("phone", f);
              }}
              className={inputCls}
              autoComplete="tel"
              placeholder="+86 138 0013 8000"
            />
            {/* The number formats itself into its country's shape on blur (V2
                feedback: format, don't announce "Detected <country>"). Format on
                blur, not per keystroke — rewriting the value mid-typing fights
                the cursor. The helper shows only while we can't tell the
                country; once we can, the formatted number says it. */}
            {!countryHint(v.phone) && (
              <p className="mt-1 text-xs text-white/40">
                Outside the US? Include your country code, e.g. +86.
              </p>
            )}
            <FieldError msg={errors.phone} />
          </div>
          {/* LinkedIn, WeChat, personal website, the enrichment opt-in and the
              student-resource prompt used to sit here. Creating an account is now
              name + email + phone only; all of these are part of finishing your
              profile and stay editable on /family (member-card.tsx). */}
        </div>
        </Section>

        {/* Location, interests & photos, OHS affiliation, builder interest and
            the co-parent invite USED to live here. Creating an account now asks
            only for the basics (role + name + email + phone) — everything else
            moved into finishing your profile afterwards, where it is editable on
            /family. Removing them here is safe because member-card.tsx already
            edits every one of those fields (parent feedback, Aug 2026: signup
            was far too long). */}

        <label className="mt-2 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/75">
          <input
            id="termsAccepted"
            type="checkbox"
            checked={v.termsAccepted}
            onChange={(e) => set("termsAccepted", e.target.checked, true)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
          />
          <span>
            I agree to the{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
            >
              community terms
            </a>{" "}
            and{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
            >
              privacy policy
            </a>
            . GoPixel is a space for OHS families — no advertising, and be kind.
            <FieldError msg={errors.termsAccepted} />
          </span>
        </label>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onContinue}
            disabled={submitting || status === "error"}
            title={
              status === "error"
                ? "Your info hasn't been saved yet — retry the save first."
                : undefined
            }
            className="rounded-lg bg-amber-400 px-6 py-3 font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {/* Verification comes next for every role now (round 3) — the old
                "Add Your Child(ren)" / "Add Your Parent" labels promised steps
                that no longer follow immediately. */}
            {submitting ? "…" : "Continue →"}
          </button>
          {/* On save failure, retry is the ONLY way forward — the button above is
              disabled until the save succeeds. Show WHY alongside the retry: a
              bot-check / VPN / ad-blocker block is not transient, so a bare
              "click to retry" is a dead end that fails forever with no
              explanation (this is what a tester actually hit, Jul 2026). The
              same message already existed for the submit + invite paths; it just
              never reached the autosave-failure UI. */}
          {status === "error" ? (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => void flush()}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-red-400/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20"
              >
                <IconWarning className="h-4 w-4" /> Couldn&apos;t save — click to retry
              </button>
              <p className="max-w-prose text-sm text-white/60">
                {ensureErrorView === "blocked"
                  ? "We couldn't verify your browser. If you're using a VPN, private relay, or an ad/tracker blocker, turn it off for this page and try again."
                  : "Something went wrong saving your info. Please check your connection and try again."}
              </p>
            </div>
          ) : (
            <SaveStatus status={status} />
          )}
        </div>
      </div>

    </>
  );
}
