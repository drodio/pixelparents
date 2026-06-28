"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { CREDIT_PACKS, DOSSIER_COST_CENTS } from "@/lib/credit-packs";

// The Chief "Deep Intelligence" dossier box, shown on a profile below the
// Leaderboard / Tokenmaxxer pills (same box style as Member Endorsements).
//
// States:
//   • ready (shareUrl)  → the whole box links out to the Chief share URL:
//       "[logo] View the Deep Intelligence dossier / for <name>"
//   • running           → "[logo] Generating … (~10 min)", not clickable.
//   • none / failed     → "[logo] Run a deep intelligence dossier / for <name>",
//       which expands to a short blurb + [Run Now]. Run Now opens a modal that
//       signs the viewer in, shows their balance, and either runs the dossier
//       (deducting $50) when funded or sells credits when not.

// Dark-mode mark (gold crown + white wordmark) — reads on the dark profile box.
const LOGO_SRC = "/images/chief-logo-gold-crown-white-text-dark-mode.png";

function ChiefLogo() {
  // On any load error, fall back to a clean gold "Chief" wordmark instead of a
  // broken-image icon.
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="shrink-0 font-display text-base font-bold text-[#dfa43a]">Chief</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_SRC}
      alt="Chief"
      className="h-[38px] w-auto shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

const fmtUsd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

// Super-admin only: run a dossier without deducting credits. The server
// re-verifies super-admin status, so this button can't grant a free run on its own.
function AdminRunButton({ running, onRun }: { running: boolean; onRun: () => void }) {
  return (
    <button
      type="button"
      onClick={onRun}
      disabled={running}
      title="Super admin: run this dossier without deducting credits"
      className="rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {running ? "Starting…" : "Admin"}
    </button>
  );
}

export function ProfileDossierBox({
  name,
  evaluationId,
  shareUrl,
  status,
  superAdmin = false,
}: {
  name: string;
  evaluationId: string;
  // The Chief share link when a ready dossier exists; null → run/running state.
  shareUrl: string | null;
  // The dossier's current status ("running" | "failed" | …) or null when none.
  status: string | null;
  // Super admins get a red "Admin" run-free button (verified server-side too).
  superAdmin?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const router = useRouter();

  // While a dossier is generating, poll the server every 30s so the box flips to
  // "View" on its own once the cron marks it ready — no manual refresh. The
  // effect is declared unconditionally (rules of hooks) and only arms the timer
  // while running; it tears down once the status changes.
  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [status, router]);

  // Flash the "View" box green for 30s the moment a dossier finishes (running →
  // ready), to draw the eye after the auto-refresh swaps it in. Keyed on the
  // transition (via a ref that survives router.refresh re-renders), so an
  // already-ready dossier on a fresh page load does NOT flash.
  const [justReady, setJustReady] = useState(false);
  const prevStatus = useRef<string | null>(status);
  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = status;
    if (prev === "running" && status === "ready") {
      setJustReady(true);
      const id = setTimeout(() => setJustReady(false), 30_000);
      return () => clearTimeout(id);
    }
  }, [status]);

  const boxClass =
    "w-full max-w-md mx-auto rounded-lg border border-zinc-800 bg-white/[0.02] px-4 py-3 transition-colors";

  // ── State: dossier ready → the box is a link out to Chief ──
  if (shareUrl) {
    // Flash green for 30s right after it finishes; otherwise the normal box.
    const readyClass = justReady
      ? "w-full max-w-md mx-auto rounded-lg border border-green-500 bg-green-500/15 ring-1 ring-green-500/40 px-4 py-3 transition-colors flex items-center gap-3"
      : `${boxClass} flex items-center gap-3 hover:bg-white/[0.05]`;
    return (
      <>
        <div className="group flex flex-col items-center gap-1">
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={readyClass}
          >
            <ChiefLogo />
            <span className="flex flex-col text-left text-sm leading-snug text-zinc-200">
              <span>View the Deep Intelligence dossier</span>
              <span>
                for <span className="font-semibold text-[#dfa43a]">{name}</span>
              </span>
            </span>
          </a>
          {/* Revealed on hover/focus of the box: re-run treats it as a brand-new
              run via the same modal (charges again, or free for super admins). */}
          <button
            type="button"
            onClick={() => setShowCredits(true)}
            className="text-xs text-zinc-500 opacity-0 transition-opacity hover:text-zinc-300 focus-visible:opacity-100 group-hover:opacity-100"
          >
            or <span className="text-[#dfa43a] underline">re-run</span> the dossier to update it
          </button>
        </div>

        {showCredits && (
          <CreditsModal
            name={name}
            evaluationId={evaluationId}
            superAdmin={superAdmin}
            onClose={() => setShowCredits(false)}
          />
        )}
      </>
    );
  }

  // ── State: dossier generating → informational, not clickable ──
  if (status === "running") {
    return (
      <div className={`${boxClass} flex items-center gap-3`}>
        <ChiefLogo />
        <span className="flex flex-col text-left text-sm leading-snug text-zinc-200">
          <span>
            <span className="inline-block animate-pulse">Generating</span> the Deep Intelligence
            dossier…
          </span>
          <span className="text-zinc-400">
            for <span className="font-semibold text-[#dfa43a]">{name}</span> — this takes ~10 min.
          </span>
        </span>
      </div>
    );
  }

  // ── State: no dossier (or a prior run failed) → "Run …", expands to Run Now ──
  return (
    <>
      <div className={`${boxClass} flex flex-col gap-3`}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-3 text-left"
        >
          <ChiefLogo />
          <span className="flex flex-col text-left text-sm leading-snug text-zinc-200">
            <span>Run a deep intelligence dossier</span>
            <span>
              for <span className="font-semibold text-[#dfa43a]">{name}</span>
            </span>
          </span>
          <span
            aria-hidden
            className={`ml-auto text-zinc-500 transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            ▸
          </span>
        </button>

        {expanded && (
          <div className="flex flex-col gap-3 border-t border-zinc-800 pt-3">
            {status === "failed" && (
              <p className="text-xs text-amber-400">
                The last run didn’t complete — you can try again.
              </p>
            )}
            <p className="text-sm text-zinc-400">
              Have Chief run a detailed dossier on{" "}
              <span className="text-zinc-200">{name}</span> using its Deep
              Intelligence functionality.
            </p>
            <button
              type="button"
              onClick={() => setShowCredits(true)}
              className="self-center rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-5 py-2 text-sm transition-colors"
            >
              Run Now
            </button>
          </div>
        )}
      </div>

      {showCredits && (
        <CreditsModal
          name={name}
          evaluationId={evaluationId}
          superAdmin={superAdmin}
          onClose={() => setShowCredits(false)}
        />
      )}
    </>
  );
}

// The "Run" gate shown when the viewer clicks "Run Now". Signs them in, shows
// their balance, and then EITHER runs the dossier (deducting $50) when they have
// enough credits, OR sells credits (reusing the /developers checkout flow) when
// they don't. Reuses the same primitives as the /developers credits section.
function CreditsModal({
  name,
  evaluationId,
  superAdmin,
  onClose,
}: {
  name: string;
  evaluationId: string;
  superAdmin: boolean;
  onClose: () => void;
}) {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const [buying, setBuying] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Current credit balance (cents), or null until loaded / when signed out.
  const [balanceCents, setBalanceCents] = useState<number | null>(null);

  // Escape closes the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Load the viewer's credit balance once signed in.
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/developers/credits");
        const data = (await res.json().catch(() => null)) as { balance_cents?: number } | null;
        if (!cancelled && res.ok && typeof data?.balance_cents === "number") {
          setBalanceCents(data.balance_cents);
        }
      } catch {
        /* leave balance unknown */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  const funded = balanceCents != null && balanceCents >= DOSSIER_COST_CENTS;

  async function run(admin = false) {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/dossier/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluationId, admin }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; status?: string; error?: string; balance_cents?: number }
        | null;
      if (res.ok || res.status === 409) {
        // Started (or already running) — reload so the box shows "Generating…".
        window.location.reload();
        return;
      }
      if (res.status === 402) {
        if (typeof data?.balance_cents === "number") setBalanceCents(data.balance_cents);
        setError("You don’t have enough credits — add $50 below, then run.");
      } else {
        setError(data?.error ?? `Couldn’t start the dossier (status ${res.status}).`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setRunning(false);
    }
  }

  async function buy(packId: string) {
    if (buying) return;
    setBuying(true);
    setError(null);
    try {
      const res = await fetch("/api/developers/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Return to THIS profile after checkout (not /developers) so the buyer
        // lands back where they started to run the dossier.
        body: JSON.stringify({
          packId,
          returnTo: typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      });
      // The route can 500 with an empty body (e.g. Stripe not configured in this
      // environment), so parse defensively rather than assuming JSON.
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (res.ok && data?.url) {
        window.location.assign(data.url);
      } else {
        setError(data?.error ?? `Checkout unavailable (status ${res.status}). Payments may not be configured in this environment.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBuying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-xl border border-zinc-800 bg-[#111] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ChiefLogo />
            <h3 className="font-display text-lg font-semibold text-zinc-100">
              Deep Intelligence dossier
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-xl leading-none text-zinc-500 hover:text-white"
          >
            ×
          </button>
        </div>

        <p className="mt-3 text-center text-sm text-zinc-300">
          {funded ? (
            <>
              You have enough credits to run a Deep Intelligence dossier on{" "}
              <span className="text-[#dfa43a]">{name}</span>{" "}
              (<span className="font-semibold text-zinc-100">$50 each</span>).
            </>
          ) : (
            <>
              Deep Intelligence dossiers cost{" "}
              <span className="font-semibold text-zinc-100">$50 each</span>. Register
              and buy credits to continue, then run a full dossier on{" "}
              <span className="text-[#dfa43a]">{name}</span>.
            </>
          )}
        </p>

        {/* Step 1 — register / sign in */}
        <div className="mt-5 flex flex-col gap-2">
          <div className="text-center text-[11px] uppercase tracking-[0.15em] text-zinc-500">
            Step 1 — Register / sign in
          </div>
          {!isLoaded ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : isSignedIn ? (
            <div className="flex flex-col items-center gap-0.5 text-center">
              <p className="text-sm font-medium text-green-400">
                ✓ Signed in{email ? ` as ${email}` : ""}
              </p>
              {balanceCents != null && (
                <p className="text-sm text-zinc-400">
                  Credit balance:{" "}
                  <span className="font-semibold text-zinc-200">{fmtUsd(balanceCents)}</span>
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => clerk.openSignIn({})}
              className="self-center rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-5 py-2 text-sm transition-colors"
            >
              Register / Sign in
            </button>
          )}
        </div>

        {/* Step 2 — run (when funded) or buy credits (when not). */}
        {funded ? (
          <div className="mt-5 flex flex-col gap-2">
            <div className="text-center text-[11px] uppercase tracking-[0.15em] text-zinc-500">
              Step 2 — Run the dossier
            </div>
            <button
              type="button"
              onClick={() => run(false)}
              disabled={running}
              className="self-center rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-5 py-2 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {running ? "Starting…" : "Run dossier — $50"}
            </button>
            <p className="text-center text-xs text-zinc-500">
              $50 is deducted from your balance. The dossier takes ~10 minutes to generate.
            </p>
            {/* Optional top-up — buying is not required when already funded. */}
            <div className="mt-3 text-center text-[11px] uppercase tracking-[0.15em] text-zinc-500">
              Add more credits (optional)
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {CREDIT_PACKS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => buy(p.id)}
                  disabled={buying}
                  className="rounded-md border border-zinc-700 bg-transparent hover:bg-white/[0.05] text-zinc-300 font-medium px-3 py-1.5 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {p.label}
                </button>
              ))}
              {superAdmin && <AdminRunButton running={running} onRun={() => run(true)} />}
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-2">
            <div className="text-center text-[11px] uppercase tracking-[0.15em] text-zinc-500">
              Step 2 — Buy credits
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {CREDIT_PACKS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => buy(p.id)}
                  disabled={!isSignedIn || buying}
                  className="rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-4 py-2 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {p.label}
                </button>
              ))}
              {superAdmin && <AdminRunButton running={running} onRun={() => run(true)} />}
            </div>
            {!isSignedIn && isLoaded && (
              <p className="text-center text-xs text-zinc-500">Sign in first to buy credits.</p>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-md border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
