"use client";

import { useState, useEffect } from "react";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { buildAgentGuide } from "@/lib/developers/agent-guide";
import { CREDIT_PACKS } from "@/lib/credit-packs";

type KeyRow = {
  id: string;
  prefix: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type LedgerRow = {
  deltaCents: number;
  reason: string;
  createdAt: string;
  // The scored person on a "score_debit" row (name or LinkedIn handle); null for topups.
  subject?: string | null;
  // The eval that was paid for — lets us link the activity row to its profile.
  evaluationId?: string | null;
};

const ACTIVITY_PER_PAGE = 10;

const REASON_LABEL: Record<string, string> = {
  topup: "Top-up",
  score_debit: "Score",
  refund: "Refund",
};

// Fetches the user's active API keys from the server and returns them.
// Returns null on error (non-critical; caller leaves list empty).
async function loadKeys(): Promise<KeyRow[] | null> {
  try {
    const res = await fetch("/api/developers/keys");
    if (!res.ok) return null;
    const data = await res.json();
    return data.keys ?? [];
  } catch {
    return null;
  }
}

export function DeveloperConsole() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");

  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [keysLoading, setKeysLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [guideCopied, setGuideCopied] = useState(false);
  const [label, setLabel] = useState("");
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [buying, setBuying] = useState(false);
  const [topupSuccess, setTopupSuccess] = useState(false);
  const [activityPage, setActivityPage] = useState(0);

  // Load keys once auth state is resolved and the user is signed in.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKeysLoading(true);
    loadKeys().then((result) => {
      if (cancelled) return;
      if (result !== null) setKeys(result);
      setKeysLoading(false);
    });
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn]);

  // Load credits balance + ledger once auth is ready.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    if (typeof window !== "undefined" && window.location.search.includes("topup=success")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTopupSuccess(true);
    }
    fetch("/api/developers/credits").then(async (res) => {
      if (cancelled || !res.ok) return;
      const data = await res.json();
      if (cancelled) return;
      setBalanceCents(data.balance_cents ?? 0);
      setLedger(data.ledger ?? []);
    });
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn]);

  async function buy(packId: string) {
    if (buying) return;
    setBuying(true);
    setError(null);
    try {
      const res = await fetch("/api/developers/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.assign(data.url);
      } else {
        setError(data.error ?? "Checkout failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBuying(false);
    }
  }

  async function generateKey() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/developers/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setError(data.message ?? "You already have 5 active keys. Revoke one first.");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      setRawKey(data.raw);
      setLabel("");
      const refreshed = await loadKeys();
      if (refreshed !== null) setKeys(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  async function revokeKey(id: string) {
    if (
      !window.confirm(
        "Delete this API key? Any app or agent using it will stop working immediately.",
      )
    ) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/developers/keys/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Could not delete the key — please try again.");
        return;
      }
      const refreshed = await loadKeys();
      if (refreshed !== null) setKeys(refreshed);
    } catch {
      setError("Network error while deleting the key.");
    }
  }

  function copyKey() {
    if (!rawKey) return;
    navigator.clipboard.writeText(rawKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Always a placeholder — we never bake a real key into the copyable markdown.
  const guideMarkdown = buildAgentGuide({ baseUrl });

  function copyGuide() {
    navigator.clipboard.writeText(guideMarkdown).then(() => {
      setGuideCopied(true);
      setTimeout(() => setGuideCopied(false), 2000);
    });
  }

  function downloadGuide() {
    const blob = new Blob([guideMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "founder-score-api.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!isLoaded) {
    return <div className="text-zinc-500 text-sm py-4">Loading…</div>;
  }

  // Activity pagination — 10 rows per page.
  const activityPageCount = Math.max(1, Math.ceil(ledger.length / ACTIVITY_PER_PAGE));
  const activityPageSafe = Math.min(activityPage, activityPageCount - 1);
  const activityRows = ledger.slice(
    activityPageSafe * ACTIVITY_PER_PAGE,
    activityPageSafe * ACTIVITY_PER_PAGE + ACTIVITY_PER_PAGE,
  );

  return (
    <div className="flex flex-col gap-10">
      {/* ── Step 1 ── */}
      <section className="flex flex-col gap-3">
        <h3 className="font-display text-lg font-semibold text-zinc-100">
          Step 1 — Register / sign in
        </h3>
        {isSignedIn ? (
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-green-400 font-medium">
              ✓ Signed in{email ? ` as ${email}` : ""}
            </p>
            <button
              type="button"
              onClick={() => clerk.openUserProfile()}
              className="rounded-md border border-zinc-700 hover:border-zinc-500 bg-zinc-900/70 text-zinc-300 hover:text-white text-xs font-medium px-3 py-1.5 transition-colors"
            >
              Manage account
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() =>
              clerk.openSignIn({
                // forceRedirectUrl wins over any dashboard default, so the
                // developer lands back here (signed in) after sign-in OR sign-up
                // — not on the festival home page.
                forceRedirectUrl: "/developers",
                signUpForceRedirectUrl: "/developers",
              })
            }
            className="self-start rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-5 py-2.5 text-sm transition-colors"
          >
            Register / Sign in
          </button>
        )}
      </section>

      {/* ── Step 2 ── */}
      <section className="flex flex-col gap-3">
        <h3 className="font-display text-lg font-semibold text-zinc-100">
          Step 2 — Generate an API key
        </h3>

        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={!isSignedIn}
          maxLength={60}
          placeholder="Describe this key (e.g. “CRM integration”) — optional"
          className="w-full max-w-md rounded-md bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-40"
        />

        <button
          type="button"
          disabled={!isSignedIn || loading}
          onClick={generateKey}
          className="self-start rounded-md bg-[#dfa43a] hover:bg-[#c98e2a] text-black font-semibold px-5 py-2.5 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Generating…" : "Generate API key"}
        </button>

        {error && (
          <p className="text-sm text-red-400 rounded-md border border-red-800 bg-red-950/40 px-4 py-2">
            {error}
          </p>
        )}

        {rawKey && (
          <div className="flex flex-col gap-2 rounded-lg border border-yellow-700 bg-yellow-950/30 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wide">
                Copy this now — it won&apos;t be shown again
              </p>
              <button
                type="button"
                onClick={() => setRawKey(null)}
                aria-label="Dismiss"
                title="Dismiss"
                className="shrink-0 text-yellow-500/70 hover:text-yellow-100 text-lg leading-none px-1"
              >
                ×
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="flex-1 min-w-0 break-all font-mono text-sm text-yellow-100 bg-black/50 rounded px-3 py-2 border border-yellow-900">
                {rawKey}
              </code>
              <button
                type="button"
                onClick={copyKey}
                className="shrink-0 rounded border border-yellow-700 bg-yellow-900/40 hover:bg-yellow-900/70 text-yellow-200 text-xs font-medium px-3 py-1.5 transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {/* Key list */}
        {isSignedIn && keys.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wide">
              Your active keys ({keys.length}/5)
            </p>
            <div className="flex flex-col gap-1.5">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center gap-3 text-xs text-zinc-400 font-mono bg-zinc-900/50 rounded px-3 py-1.5 border border-zinc-800"
                >
                  <span className="text-zinc-300">{k.prefix}…</span>
                  <span className="text-zinc-500 truncate">{k.label}</span>
                  <span className="ml-auto shrink-0 text-zinc-600">
                    {new Date(k.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => revokeKey(k.id)}
                    aria-label={`Delete key ${k.prefix}`}
                    className="shrink-0 rounded border border-zinc-700 hover:border-red-700 text-zinc-400 hover:text-red-300 px-2 py-0.5 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
            {keysLoading && (
              <p className="text-xs text-zinc-600 mt-1">Refreshing…</p>
            )}
          </div>
        )}
      </section>

      {/* ── Credits ── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display text-lg font-semibold text-zinc-100">
            Credits
          </h3>
          <span className="font-mono font-semibold text-green-400">
            {isSignedIn && balanceCents !== null
              ? `$${(balanceCents / 100).toFixed(2)}`
              : "—"}
          </span>
        </div>
        <p className="text-xs">
          <span className="font-semibold text-zinc-100">
            Using our API to get scores and information on existing profiles is 100% free.
          </span>
          <br />
          <span className="text-zinc-400">
            Buy credits to score new profiles. Those profiles will also be added to
            the Leaderboard and made available to all API users.
          </span>
        </p>

        {topupSuccess && (
          <p className="text-sm text-green-400 font-medium">✓ Credits added</p>
        )}

        <div className="flex flex-wrap gap-2">
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
        </div>

        {ledger.length > 0 && (
          <div className="mt-1">
            <p className="text-xs text-zinc-500 mb-1.5 uppercase tracking-wide">Recent activity</p>
            <div className="flex flex-col gap-1">
              {activityRows.map((row, i) => (
                <div
                  key={activityPageSafe * ACTIVITY_PER_PAGE + i}
                  className="flex items-center gap-3 text-xs text-zinc-400 bg-zinc-900/50 rounded px-3 py-1.5 border border-zinc-800"
                >
                  <span className="text-zinc-300 min-w-0 truncate">
                    {REASON_LABEL[row.reason] ?? row.reason}
                    {row.subject ? (
                      <>
                        {" · "}
                        {row.evaluationId ? (
                          <a
                            href={`/profile?e=${row.evaluationId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#dfa43a] hover:underline"
                          >
                            {row.subject}
                          </a>
                        ) : (
                          row.subject
                        )}
                      </>
                    ) : null}
                  </span>
                  <span className={`shrink-0 ${row.deltaCents >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {row.deltaCents >= 0 ? "+" : ""}${(row.deltaCents / 100).toFixed(2)}
                  </span>
                  <span className="ml-auto shrink-0 text-zinc-600 tabular-nums">
                    {new Date(row.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
            {activityPageCount > 1 && (
              <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                <button
                  type="button"
                  onClick={() => setActivityPage((p) => Math.max(0, p - 1))}
                  disabled={activityPageSafe <= 0}
                  className="rounded border border-zinc-700 px-2 py-0.5 hover:border-zinc-500 disabled:opacity-30"
                >
                  Prev
                </button>
                <span className="tabular-nums">
                  Page {activityPageSafe + 1} of {activityPageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setActivityPage((p) => Math.min(activityPageCount - 1, p + 1))}
                  disabled={activityPageSafe >= activityPageCount - 1}
                  className="rounded border border-zinc-700 px-2 py-0.5 hover:border-zinc-500 disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Markdown agent guide ── */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-bold text-zinc-100">
          Then just paste this Markdown file into your favorite coding agent:
        </h2>

        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            onClick={copyGuide}
            className="rounded-md border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-medium px-4 py-2 transition-colors"
          >
            {guideCopied ? "Copied!" : "Copy"}
          </button>
          <button
            type="button"
            onClick={downloadGuide}
            className="rounded-md border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-medium px-4 py-2 transition-colors"
          >
            Download .md
          </button>
        </div>

        <pre className="overflow-x-auto overflow-y-auto max-h-[28rem] rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-xs text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap">
          {guideMarkdown}
        </pre>
      </section>
    </div>
  );
}
