"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useReverification, useSession } from "@clerk/nextjs";
import { COUNTRIES, defaultCountry, flagEmoji, type Country } from "@/lib/country-codes";
import { formatPhone } from "@/lib/format-phone";

// Clerk's "strict" reverification level (which createPhoneNumber +
// createEmailAddress sit under) fires when the session's first-factor was
// last verified more than 10 minutes ago. We show the heads-up hint only
// when we're close to or past that threshold.
const REVERIFICATION_HINT_MINUTES = 9;

function useReverificationLikely(): boolean {
  const { session } = useSession();
  const ageMin = session?.factorVerificationAge?.[0] ?? Infinity;
  return ageMin >= REVERIFICATION_HINT_MINUTES;
}

type Props = {
  // setup    → original first-time flow with "Finalize Membership" CTA at the
  //            bottom that routes to nextUrl when both methods are verified.
  // settings → revisit-after-claim flow. No bottom CTA (toggles save on
  //            click). The verify cards still show so the user can swap or
  //            add an email / phone.
  mode?: "setup" | "settings";
  nextUrl?: string;
  // An operator/CSV-provided phone (E.164) we have on file for this person but
  // that they haven't verified. Surfaced in the Text card as a one-tap "verify
  // this number" prefill. null when we have none / it's already their verified #.
  suggestedPhone?: string | null;
};

type CardMode = "view" | "input" | "code";

// Per-channel notification prefs. Each category has its own email + text
// boolean — see /api/account/preferences and the users table.
type Prefs = {
  // Legacy single-column keys (server still reads them for back-compat; new
  // UI doesn't write them).
  prefInviteEvents: boolean;
  prefFestivalUpdates: boolean;
  prefSponsorIntros: boolean;
  prefTextAlerts: boolean;
  // Per-channel keys driven by the new table UI.
  prefEmailInviteEvents: boolean;
  prefTextInviteEvents: boolean;
  prefEmailFestivalUpdates: boolean;
  prefTextFestivalUpdates: boolean;
  prefEmailInvestorIntros: boolean;
  prefTextInvestorIntros: boolean;
  prefEmailFounderIntros: boolean;
  prefTextFounderIntros: boolean;
  prefEmailSponsorIntros: boolean;
  prefTextSponsorIntros: boolean;
  // Event logistics (updates, reminders) — the channel for event blasts.
  prefEmailEventLogistics: boolean;
  prefTextEventLogistics: boolean;
};

const DEFAULT_PREFS: Prefs = {
  prefInviteEvents: true,
  prefFestivalUpdates: true,
  prefSponsorIntros: true,
  prefTextAlerts: true,
  prefEmailInviteEvents: true,
  prefTextInviteEvents: true,
  prefEmailFestivalUpdates: true,
  prefTextFestivalUpdates: false,
  prefEmailInvestorIntros: true,
  prefTextInvestorIntros: false,
  prefEmailFounderIntros: true,
  prefTextFounderIntros: false,
  prefEmailSponsorIntros: true,
  prefTextSponsorIntros: false,
  prefEmailEventLogistics: true,
  prefTextEventLogistics: true,
};

type PrefRow = { label: string; emailKey: keyof Prefs; textKey: keyof Prefs };

// "Global notifications" — Festival-wide, not tied to a specific event.
const GLOBAL_PREF_ROWS: ReadonlyArray<PrefRow> = [
  { label: "Send me occasional Festival updates", emailKey: "prefEmailFestivalUpdates", textKey: "prefTextFestivalUpdates" },
  { label: "Introduce me to high-signal investors", emailKey: "prefEmailInvestorIntros", textKey: "prefTextInvestorIntros" },
  { label: "Introduce me to high-signal founders", emailKey: "prefEmailFounderIntros", textKey: "prefTextFounderIntros" },
  { label: "Introduce me to sponsors I could benefit from", emailKey: "prefEmailSponsorIntros", textKey: "prefTextSponsorIntros" },
];

// "Event notifications" — invites + per-event logistics (the unsubscribe footer
// on event emails deep-links to this box).
const EVENT_PREF_ROWS: ReadonlyArray<PrefRow> = [
  { label: "Invite me to events I qualify for", emailKey: "prefEmailInviteEvents", textKey: "prefTextInviteEvents" },
  { label: "Send me event logistics (updates, reminders, etc.)", emailKey: "prefEmailEventLogistics", textKey: "prefTextEventLogistics" },
];


export function AccountSetupForm({ mode = "setup", nextUrl, suggestedPhone = null }: Props) {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setPrefs((p) => ({ ...p, ...data }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function savePref<K extends keyof Prefs>(key: K, value: boolean) {
    const prev = prefs[key];
    setPrefs((p) => ({ ...p, [key]: value }));
    try {
      const res = await fetch("/api/account/preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setPrefs((p) => ({ ...p, [key]: prev }));
    }
  }

  if (!isLoaded || !user) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  const hasEmail = !!user.primaryEmailAddress;
  const hasPhone = !!user.primaryPhoneNumber;
  const bothVerified = hasEmail && hasPhone;

  // Each card has one of three states for its border color:
  //   verified — done, green.
  //   active   — this is the next thing the user needs to do, gold.
  //   neutral  — idle, zinc.
  // When both unverified, email is active first; when email's done but
  // phone isn't, phone becomes active.
  const emailState: CardState = hasEmail ? "verified" : "active";
  const phoneState: CardState = hasPhone ? "verified" : hasEmail ? "active" : "neutral";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <EmailCard state={emailState} />
        <PhoneCard state={phoneState} suggestedPhone={suggestedPhone} />
      </div>
      <PreferencesTable
        title="Global notifications"
        rows={GLOBAL_PREF_ROWS}
        prefs={prefs}
        onPrefChange={savePref}
        enabled={bothVerified}
      />
      <PreferencesTable
        title="Event notifications"
        rows={EVENT_PREF_ROWS}
        prefs={prefs}
        onPrefChange={savePref}
        enabled={bothVerified}
        id="event-notifications"
      />

      {mode === "setup" && (
        <div className="flex justify-end pt-4">
          <button
            onClick={() => nextUrl && router.push(nextUrl)}
            disabled={!bothVerified}
            className="rounded-md bg-white text-black font-medium px-6 py-3 disabled:opacity-40"
          >
            Finalize Membership
          </button>
        </div>
      )}
      {mode === "settings" && (
        <p className="text-xs text-zinc-500 pt-2">
          Changes save automatically.
        </p>
      )}
    </div>
  );
}

function PreferencesTable({
  title,
  rows,
  prefs,
  onPrefChange,
  enabled,
  id,
}: {
  title: string;
  rows: ReadonlyArray<PrefRow>;
  prefs: Prefs;
  onPrefChange: <K extends keyof Prefs>(k: K, v: boolean) => void;
  enabled: boolean;
  id?: string;
}) {
  // When `enabled` is false the whole card (incl. its header) renders grayed
  // out. The "verify your phone/email to enable" hint shows as a hover tooltip
  // when the user mouses over a disabled toggle.
  return (
    <div id={id} className="rounded-md border border-zinc-800 bg-zinc-950 p-5 flex flex-col gap-3 scroll-mt-20">
      <h2
        className={`font-display text-lg font-bold ${
          enabled ? "" : "text-zinc-500"
        }`}
      >
        {title}
      </h2>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 sm:gap-x-6 gap-y-1 items-center">
        {/* Header row */}
        <div></div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 text-center w-12">
          Email
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 text-center w-12">
          Text
        </div>
        {rows.map((row) => (
          <PrefsRow
            key={row.label}
            label={row.label}
            emailChecked={prefs[row.emailKey]}
            textChecked={prefs[row.textKey]}
            onEmailChange={(v) => onPrefChange(row.emailKey, v)}
            onTextChange={(v) => onPrefChange(row.textKey, v)}
            disabled={!enabled}
          />
        ))}
      </div>
    </div>
  );
}

function PrefsRow({
  label,
  emailChecked,
  textChecked,
  onEmailChange,
  onTextChange,
  disabled,
}: {
  label: string;
  emailChecked: boolean;
  textChecked: boolean;
  onEmailChange: (v: boolean) => void;
  onTextChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className={`text-sm py-1.5 ${disabled ? "text-zinc-500" : "text-zinc-200"}`}>
        {label}
      </div>
      <div className="flex justify-center">
        <Toggle
          checked={emailChecked}
          onChange={onEmailChange}
          label={`Email me about: ${label}`}
          disabled={disabled}
        />
      </div>
      <div className="flex justify-center">
        <Toggle
          checked={textChecked}
          onChange={onTextChange}
          label={`Text me about: ${label}`}
          disabled={disabled}
        />
      </div>
    </>
  );
}

// Email mode adds "addAnother" for adding additional verified emails (kept
// as secondary; doesn't replace primary). "input" is still the existing
// CHANGE flow that swaps the primary.
type EmailMode = CardMode | "addAnother";

function EmailCard({ state }: { state: CardState }) {
  const { user } = useUser();
  const router = useRouter();
  const currentEmailObj = user?.primaryEmailAddress ?? null;
  const currentEmail = currentEmailObj?.emailAddress ?? null;
  // All verified emails the user has (Clerk lists every confirmed address).
  // Used to render extras as a small list under the primary.
  const verifiedEmails =
    user?.emailAddresses?.filter((e) => e.verification?.status === "verified") ?? [];
  const extraEmails = verifiedEmails.filter((e) => e.id !== currentEmailObj?.id);

  const [mode, setMode] = useState<EmailMode>(currentEmail ? "view" : "input");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingEmailId, setPendingEmailId] = useState<string | null>(null);
  const previousEmailIdRef = useRef<string | null>(null);
  // True when the user clicked "+ Add another" rather than "Change" — we
  // skip the "promote to primary + delete old" step in verifyCode().
  const isAddingExtra = useRef(false);
  // Mirrors PhoneCard: show the re-auth heads-up when Clerk is likely to
  // demand reverification (session's first-factor age >= ~9 minutes).
  const reverificationLikely = useReverificationLikely();

  const addAndPrepareEmail = useReverification(async (address: string) => {
    if (!user) throw new Error("no user");
    const emailObj = await user.createEmailAddress({ email: address });
    await emailObj.prepareVerification({ strategy: "email_code" });
    return emailObj.id;
  });

  function startChange() {
    previousEmailIdRef.current = currentEmailObj?.id ?? null;
    isAddingExtra.current = false;
    setEmail("");
    setCode("");
    setError(null);
    setMode("input");
  }

  function startAddAnother() {
    previousEmailIdRef.current = null;
    isAddingExtra.current = true;
    setEmail("");
    setCode("");
    setError(null);
    setMode("addAnother");
  }

  function cancelEditing() {
    previousEmailIdRef.current = null;
    isAddingExtra.current = false;
    setEmail("");
    setCode("");
    setError(null);
    setMode(currentEmail ? "view" : "input");
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setBusy(true);
    try {
      const id = await addAndPrepareEmail(email.trim());
      setPendingEmailId(id);
      setMode("code");
    } catch (err: unknown) {
      setError(clerkMessage(err) || "Couldn't send code");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !pendingEmailId) return;
    setError(null);
    setBusy(true);
    try {
      const emailObj = user.emailAddresses.find((x) => x.id === pendingEmailId);
      if (!emailObj) throw new Error("Email object lost");
      await emailObj.attemptVerification({ code: code.trim() });
      // "+ Add another email" path: leave the new address as a secondary
      // verified email. Primary stays put. Otherwise (Change path): promote
      // the new email to primary and destroy the previous one.
      if (!isAddingExtra.current) {
        await user.update({ primaryEmailAddressId: emailObj.id });
        const prevId = previousEmailIdRef.current;
        if (prevId && prevId !== emailObj.id) {
          const old = user.emailAddresses.find((x) => x.id === prevId);
          if (old) {
            try {
              await old.destroy();
            } catch (err) {
              console.warn("Couldn't delete previous email", err);
            }
          }
          previousEmailIdRef.current = null;
        }
      }
      isAddingExtra.current = false;
      await user.reload();
      setMode("view");
      router.refresh();
    } catch (err: unknown) {
      setError(clerkMessage(err) || "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Email"
      state={state}
      action={
        mode === "view" && currentEmail
          ? <HeaderChangeButton onClick={startChange} />
          : null
      }
    >
      {mode === "view" && currentEmail && (
        <div className="flex flex-col gap-2">
          <CurrentValueRow value={currentEmail} />
          {extraEmails.map((e) => (
            <CurrentValueRow key={e.id} value={e.emailAddress} />
          ))}
          <button
            type="button"
            onClick={startAddAnother}
            className="self-start text-xs uppercase tracking-[0.15em] text-zinc-400 hover:text-white border border-dashed border-zinc-700 hover:border-zinc-500 rounded px-3 py-1"
            title="Add another email address"
          >
            + Add another
          </button>
        </div>
      )}
      {(mode === "input" || mode === "addAnother") && (
        <form onSubmit={sendCode} className="flex flex-col gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoFocus
            className="rounded-md bg-black border border-zinc-800 text-zinc-100 px-3 py-2 text-sm outline-none focus:border-zinc-600"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || email.trim().length < 3}
              className="flex-1 rounded-md bg-white text-black font-medium py-2 text-sm disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send 6-digit code"}
            </button>
            {currentEmail && (
              <button
                type="button"
                onClick={cancelEditing}
                className="rounded-md border border-zinc-800 hover:border-zinc-600 px-4 py-2 text-sm text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
            )}
          </div>
          {reverificationLikely && (
            <p className="text-xs text-zinc-500">
              For security, you may first need to re-auth via your original
              email to confirm your identity.
            </p>
          )}
        </form>
      )}
      {mode === "code" && (
        <form onSubmit={verifyCode} className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500">
            Sent a 6-digit code to <span className="text-zinc-300">{email}</span>.
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            autoFocus
            className="rounded-md bg-black border border-zinc-800 text-zinc-100 px-3 py-2 text-sm outline-none focus:border-zinc-600 font-mono tracking-widest text-center"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="flex-1 rounded-md bg-white text-black font-medium py-2 text-sm disabled:opacity-40"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => setMode("input")}
              className="rounded-md border border-zinc-800 hover:border-zinc-600 px-4 py-2 text-sm text-zinc-400 hover:text-white"
            >
              Use a different email
            </button>
          </div>
        </form>
      )}
      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
    </Card>
  );
}

function PhoneCard({ state, suggestedPhone }: { state: CardState; suggestedPhone: string | null }) {
  const { user } = useUser();
  const router = useRouter();
  const currentPhoneObj = user?.primaryPhoneNumber ?? null;
  const currentPhone = currentPhoneObj?.phoneNumber ?? null;
  // Show the on-file number only when it's not already a number on this account
  // (compare by digits). digits("+1 (203)…") === digits("+1203…").
  const digitsOnly = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
  const suggestedDigits = digitsOnly(suggestedPhone);
  const alreadyOnAccount =
    !!suggestedDigits &&
    (user?.phoneNumbers ?? []).some((p) => digitsOnly(p.phoneNumber) === suggestedDigits);

  const [mode, setMode] = useState<CardMode>(currentPhone ? "view" : "input");
  const [country, setCountry] = useState<Country>(defaultCountry());
  const [localNumber, setLocalNumber] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPhoneId, setPendingPhoneId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const previousPhoneIdRef = useRef<string | null>(null);

  const addAndPreparePhone = useReverification(async (e164: string) => {
    if (!user) throw new Error("no user");
    const phoneObj = await user.createPhoneNumber({ phoneNumber: e164 });
    await phoneObj.prepareVerification();
    return phoneObj.id;
  });

  function startChange() {
    previousPhoneIdRef.current = currentPhoneObj?.id ?? null;
    setLocalNumber("");
    setCode("");
    setError(null);
    setMode("input");
  }

  function cancelEditing() {
    previousPhoneIdRef.current = null;
    setLocalNumber("");
    setCode("");
    setError(null);
    setMode(currentPhone ? "view" : "input");
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setBusy(true);
    try {
      const digits = localNumber.replace(/\D/g, "");
      if (digits.length < 5) {
        setError("Phone number too short");
        setBusy(false);
        return;
      }
      const e164 = `${country.dial}${digits}`;
      const id = await addAndPreparePhone(e164);
      setPendingPhoneId(id);
      setMode("code");
    } catch (err: unknown) {
      setError(clerkMessage(err) || "Couldn't send code");
    } finally {
      setBusy(false);
    }
  }

  // One-tap: send a code to the on-file number, then drop into the code step.
  // Remove the operator/CSV "on file" number from the profile (clears
  // evaluations.phone). Does not touch any Clerk-verified number.
  async function removeSuggested() {
    setError(null);
    setRemoving(true);
    try {
      const res = await fetch("/api/account/clear-phone", { method: "POST" });
      if (!res.ok) {
        setError("Couldn't remove");
        setRemoving(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
      setRemoving(false);
    }
  }

  async function verifySuggested() {
    if (!user || !suggestedPhone) return;
    setError(null);
    setBusy(true);
    try {
      previousPhoneIdRef.current = currentPhoneObj?.id ?? null;
      const id = await addAndPreparePhone(suggestedPhone);
      setPendingPhoneId(id);
      setMode("code");
    } catch (err: unknown) {
      setError(clerkMessage(err) || "Couldn't send code");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !pendingPhoneId) return;
    setError(null);
    setBusy(true);
    try {
      const phoneObj = user.phoneNumbers.find((x) => x.id === pendingPhoneId);
      if (!phoneObj) throw new Error("Phone object lost");
      await phoneObj.attemptVerification({ code: code.trim() });
      await user.update({ primaryPhoneNumberId: phoneObj.id });
      const prevId = previousPhoneIdRef.current;
      if (prevId && prevId !== phoneObj.id) {
        const old = user.phoneNumbers.find((x) => x.id === prevId);
        if (old) {
          try {
            await old.destroy();
          } catch (err) {
            console.warn("Couldn't delete previous phone", err);
          }
        }
        previousPhoneIdRef.current = null;
      }
      await user.reload();
      setMode("view");
      router.refresh();
    } catch (err: unknown) {
      setError(clerkMessage(err) || "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  const reverificationLikely = useReverificationLikely();

  return (
    <Card
      title="Text"
      state={state}
      action={
        mode === "view" && currentPhone
          ? <HeaderChangeButton onClick={startChange} />
          : null
      }
    >
      {mode === "view" && currentPhone && (
        <CurrentValueRow value={formatPhone(currentPhone)} />
      )}
      {suggestedPhone && !alreadyOnAccount && mode !== "code" && (
        <div className="mt-2 flex flex-col gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <div className="text-xs text-zinc-400">On file — not yet verified</div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-zinc-100">{formatPhone(suggestedPhone)}</span>
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={removeSuggested}
                disabled={busy || removing}
                className="text-xs text-zinc-400 hover:text-red-400 disabled:opacity-50"
              >
                {removing ? "Removing…" : "Remove"}
              </button>
              <button
                type="button"
                onClick={verifySuggested}
                disabled={busy || removing}
                className="rounded-md bg-amber-500 text-black px-3 py-1.5 text-xs font-medium hover:bg-amber-400 disabled:opacity-50"
              >
                {busy ? "Sending…" : "Verify this number"}
              </button>
            </div>
          </div>
        </div>
      )}
      {mode === "input" && (
        <form onSubmit={sendCode} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <CountryPicker value={country} onChange={setCountry} />
            <input
              type="tel"
              required
              value={localNumber}
              onChange={(e) => setLocalNumber(e.target.value)}
              placeholder="415 555 0100"
              autoFocus
              className="flex-1 rounded-md bg-black border border-zinc-800 text-zinc-100 px-3 py-2 text-sm outline-none focus:border-zinc-600"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || localNumber.replace(/\D/g, "").length < 5}
              className="flex-1 rounded-md bg-white text-black font-medium py-2 text-sm disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send 6-digit code"}
            </button>
            {currentPhone && (
              <button
                type="button"
                onClick={cancelEditing}
                className="rounded-md border border-zinc-800 hover:border-zinc-600 px-4 py-2 text-sm text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
            )}
          </div>
          {reverificationLikely && (
            <p className="text-xs text-zinc-500">
              For security, you may first need to re-auth via email to
              confirm your identity.
            </p>
          )}
        </form>
      )}
      {mode === "code" && (
        <form onSubmit={verifyCode} className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500">
            Sent a 6-digit code to{" "}
            <span className="text-zinc-300">
              {country.dial} {localNumber}
            </span>
            .
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            autoFocus
            className="rounded-md bg-black border border-zinc-800 text-zinc-100 px-3 py-2 text-sm outline-none focus:border-zinc-600 font-mono tracking-widest text-center"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="flex-1 rounded-md bg-white text-black font-medium py-2 text-sm disabled:opacity-40"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => setMode("input")}
              className="rounded-md border border-zinc-800 hover:border-zinc-600 px-4 py-2 text-sm text-zinc-400 hover:text-white"
            >
              Use a different number
            </button>
          </div>
        </form>
      )}
      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
    </Card>
  );
}

function CountryPicker({
  value,
  onChange,
}: {
  value: Country;
  onChange: (c: Country) => void;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">Country</span>
      <select
        value={value.iso}
        onChange={(e) => {
          const next = COUNTRIES.find((c) => c.iso === e.target.value);
          if (next) onChange(next);
        }}
        aria-label="Country"
        title={value.name}
        className="w-[6.25rem] appearance-none rounded-md bg-black border border-zinc-800 hover:border-zinc-600 focus:border-zinc-600 py-2 pl-2.5 pr-6 text-sm text-zinc-100 outline-none cursor-pointer"
      >
        {COUNTRIES.map((c) => (
          <option key={c.iso} value={c.iso}>
            {flagEmoji(c.iso)} {c.dial}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        fill="none"
        className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500"
      >
        <path
          d="M3 4.5L6 7.5L9 4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  // Wrap the toggle in a `group/toggle` span so we can show a custom
  // hover bubble even when the inner button is `disabled` (native title=
  // tooltips have a 1-2s browser delay and sometimes don't fire on
  // disabled buttons at all). Bubble only renders when `disabled`.
  return (
    <span className="relative inline-flex group/toggle">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onChange(!checked);
        }}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
          checked ? "bg-emerald-500" : "bg-zinc-700"
        } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
      {disabled && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 bottom-full -translate-x-1/2 mb-2 hidden group-hover/toggle:flex whitespace-nowrap rounded-md bg-black/95 border border-zinc-700 px-2 py-1 text-[10px] text-zinc-200 shadow-lg z-20"
        >
          Verify your email + text first
        </span>
      )}
    </span>
  );
}

function CurrentValueRow({ value }: { value: string; onChange?: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm break-all">
        <span className="text-zinc-200">{value}</span>{" "}
        <span className="text-zinc-500">registered</span>
      </span>
    </div>
  );
}

// Card visual state:
//   - "neutral"  → default zinc border (idle)
//   - "active"   → gold border (this is the next thing the user needs to do)
//   - "verified" → green border (done)
type CardState = "neutral" | "active" | "verified";

function Card({
  title,
  state,
  action,
  children,
}: {
  title: string;
  state: CardState;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const borderClass =
    state === "verified"
      ? "border-emerald-600"
      : state === "active"
        ? "border-[#dfa43a]"
        : "border-zinc-800";
  return (
    <div className={`rounded-md border ${borderClass} bg-zinc-950 p-5 flex flex-col gap-3`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// CHANGE button that lives in the Card header (top-right next to the title).
// Hidden until there's something to change (i.e., the contact method is
// already on file).
function HeaderChangeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs uppercase tracking-[0.15em] text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 rounded px-3 py-1 shrink-0"
    >
      Change
    </button>
  );
}

function clerkMessage(err: unknown): string | null {
  if (err && typeof err === "object" && "errors" in err) {
    const list = (err as { errors?: Array<{ message?: string; longMessage?: string }> }).errors;
    if (list && list.length > 0) {
      return list[0].longMessage || list[0].message || null;
    }
  }
  if (err instanceof Error) return err.message;
  return null;
}
